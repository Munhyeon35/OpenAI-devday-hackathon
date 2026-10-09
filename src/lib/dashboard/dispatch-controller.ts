import { dashboardReducer } from './state.ts';
import { planCalls, projectHospital, type CallBatch } from './dispatch-adapter.ts';
import { captionMessages, type DispatchJob } from './live-data.ts';
import type { EmergencyCase, Hospital, Patient } from './types.ts';
import type { HospitalSearch, HospitalSearchResult } from '../hospitals.ts';

type State = { cases:EmergencyCase[]; batches:CallBatch[]; jobs:Record<string,DispatchJob> };
type Storage = { getItem(key:string):string|null; setItem(key:string,value:string):void };
const storageKey='bedlink-map-calls-v1';
export class DispatchController {
  state:State;
  private listeners=new Set<()=>void>();
  private storage?:Storage;
  private sending=new Set<string>();
  private searching=new Map<string,AbortController>();
  private locks=new Set<string>();
  private mode:'live'|'demo'|null=null;
  private fetcher:typeof fetch;
  private key:()=>string;
  constructor(cases:EmergencyCase[], fetcher:typeof fetch=fetch, key=()=>crypto.randomUUID()) {
    // Browser fetch must not receive this controller as its Window receiver.
    this.fetcher=fetcher.bind(globalThis);this.key=key;
    this.state={cases,batches:[],jobs:{}};
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  snapshot=()=>this.state;
  restore(storage:Storage) {
    this.storage=storage;
    try {
      const saved=JSON.parse(storage.getItem(storageKey)||'null') as State|null;
      if (saved && Array.isArray(saved.cases) && saved.cases.some(c=>c.id==='008') && Array.isArray(saved.batches) && saved.jobs) {
        this.state=saved;
        for (const batch of saved.batches.filter(b=>!b.jobId)) {
          this.errors(batch.caseId,batch.targets.map(t=>({id:t.id,reason:'발신 결과를 확인하지 못했습니다. 다시 연결을 누르면 기존 요청을 확인합니다.'})));
        }
        this.emit();
      }
    } catch { /* A broken checkpoint must not trigger any calls. */ }
  }
  private emit(){this.listeners.forEach(listener=>listener());}
  private commit(next:State){this.state=next;try{this.storage?.setItem(storageKey,JSON.stringify(next));}catch{/* Live updates still render if storage fills up. */}this.emit();}
  private reduce(action:Parameters<typeof dashboardReducer>[1]){
    this.commit({...this.state,cases:dashboardReducer({cases:this.state.cases,runtime:{}},action).cases});
  }
  setMode(mode:'live'|'demo'){this.mode=mode;}
  addCase(reception:EmergencyCase){this.reduce({type:'add',reception});}
  savePatient(caseId:string,patient:Patient){this.reduce({type:'save',caseId,patient});}
  async searchHospitals(caseId:string,patient:Patient,parameters:HospitalSearch){
    // Keep hospital IDs/mapping intact until every in-flight call is resolved.
    if(this.state.batches.some(b=>b.caseId===caseId && (!b.jobId || this.state.jobs[b.jobId]?.status!=='completed')))
      throw new Error('통화가 진행 중이거나 발신 결과를 확인 중입니다. 기존 통화가 끝난 뒤 다시 조회하세요.');
    this.searching.get(caseId)?.abort();
    const controller=new AbortController(),requestId=this.key();this.searching.set(caseId,controller);
    this.commit({...this.state,batches:this.state.batches.filter(b=>b.caseId!==caseId)});
    this.reduce({type:'search',caseId,patient,parameters,requestId});
    try {
      const response=await this.fetcher('/api/hospitals/candidates',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(parameters)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'병원 조회에 실패했습니다.');
      if(!controller.signal.aborted)this.reduce({type:'searchResult',caseId,requestId,result:result as HospitalSearchResult});
    }catch(error){if(!controller.signal.aborted)this.reduce({type:'searchError',caseId,requestId,error:error instanceof Error?error.message:'조회 실패'});}
    finally{if(this.searching.get(caseId)===controller)this.searching.delete(caseId);}
  }
  private errors(caseId:string,errors:{id:string;reason:string}[]){
    this.commit({...this.state,cases:this.state.cases.map(c=>c.id!==caseId?c:{...c,hospitals:c.hospitals.map(h=>{
      const error=errors.find(e=>e.id===h.id);return error?{...h,status:'error',note:error.reason}:h;
    })})});
  }
  async startCalls(caseId:string, confirm:(message:string)=>boolean, hospitalId?:string){
    if(this.locks.has(caseId))return;
    this.locks.add(caseId);
    try{
      if(!this.mode)throw new Error('통화 서버 모드를 확인 중입니다. 잠시 뒤 다시 시도하세요.');
      const reception=this.state.cases.find(c=>c.id===caseId);if(!reception)return;
      // An uncertain POST is retried only on an explicit click, with its ORIGINAL key/body.
      const uncertain=hospitalId?this.state.batches.find(b=>!b.jobId && b.targets.some(t=>t.id===hospitalId)):undefined;
      const ids=reception.hospitals.filter(h=>hospitalId?h.id===hospitalId&&h.status==='error':h.status==='pending').map(h=>h.id);
      if(!ids.length)return;
      const plan=uncertain?{batches:[uncertain],skipped:[]}:planCalls(reception,ids,this.key);
      this.errors(caseId,plan.skipped);
      if(!plan.batches.length)return;
      const list=plan.batches.flatMap(b=>b.body.hospitals).map(h=>`${h.name}: ${h.phone}`).join('\n');
      if(!confirm(this.mode==='live'
        ?`실제 전화 발신입니다. 통화 비용이 발생하며 입력한 환자 정보가 병원에 전달됩니다.\n${list}\n${uncertain?'이전 요청의 상태를 같은 요청 키로 확인합니다.':'위 병원들에 병렬로 전화를 걸까요?'}`
        :`모의 통화로 연결합니다. 실제 발신은 없습니다.\n${list}`))return;
      const targets=new Set(plan.batches.flatMap(b=>b.targets.map(t=>t.id)));
      const next={...this.state,batches:[...this.state.batches.filter(b=>!plan.batches.some(n=>n.key===b.key)),...plan.batches],
        cases:this.state.cases.map(c=>c.id!==caseId?c:{...c,status:'searching' as const,hospitals:c.hospitals.map(h=>targets.has(h.id)?{...h,status:'calling' as const,messages:[],callSeconds:0,note:'발신 요청 중'}:h)})};
      // Persist BEFORE POST so reload/reconnect cannot create a second outbound call.
      this.storage?.setItem(storageKey,JSON.stringify(next));
      this.commit(next);
      await Promise.allSettled(plan.batches.map(batch=>this.submit(batch)));
    }finally{this.locks.delete(caseId);}
  }
  private async submit(batch:CallBatch){
    if(this.sending.has(batch.key))return;this.sending.add(batch.key);
    let definitiveFailure=false;
    try{
      const response=await this.fetcher('/api/dispatches',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':batch.key},body:JSON.stringify(batch.body),signal:AbortSignal.timeout(25000)});
      const data=await response.json();
      if(!response.ok){definitiveFailure=response.status>=400&&response.status<500;throw new Error(typeof data.detail==='string'?data.detail:'발신 요청 실패. 다시 연결을 누르면 같은 요청을 확인합니다.');}
      const job=data as DispatchJob;
      this.commit({...this.state,batches:this.state.batches.map(b=>b.key===batch.key?{...b,jobId:job.id,uncertain:false}:b)});
      // An SSE update may have arrived while POST was still returning an older snapshot.
      this.receive([this.state.jobs[job.id]||job]);
    }catch(error){
      this.commit({...this.state,batches:definitiveFailure?this.state.batches.filter(b=>b.key!==batch.key):this.state.batches.map(b=>b.key===batch.key?{...b,uncertain:true}:b)});
      this.errors(batch.caseId,batch.targets.map(t=>({id:t.id,reason:error instanceof Error?error.message:'발신 결과 확인 실패'})));
    }finally{this.sending.delete(batch.key);}
  }
  receive(jobs:DispatchJob[]){
    const relevant=(job:DispatchJob)=>this.state.batches.some(batch=>batch.jobId===job.id ||
      (!batch.jobId && JSON.stringify(batch.body.patient)===JSON.stringify(job.patient) &&
        job.hospitals.some(h=>batch.targets.some(t=>t.phone===h.phone))));
    const merged=Object.fromEntries(Object.entries(this.state.jobs).filter(([,job])=>relevant(job)));
    jobs.filter(relevant).forEach(job=>merged[job.id]=job);
    this.commit({...this.state,jobs:merged});this.tick(Date.now(),0);
  }
  tick(now:number,delta:number){
    this.commit({...this.state,cases:this.state.cases.map(reception=>{
      const batches=this.state.batches.filter(b=>b.caseId===reception.id && b.jobId);
      return {...reception,elapsedSeconds:reception.elapsedSeconds+(reception.status==='completed'?0:delta),
        hospitals:reception.hospitals.map(original=>{
          const batch=batches.findLast(b=>b.targets.some(t=>t.id===original.id));
          const target=batch?.targets.find(t=>t.id===original.id);
          const call=batch?.jobId&&this.state.jobs[batch.jobId]?.hospitals.find(h=>h.phone===target?.phone);
          return call?projectHospital(original,call,now):original;
        })};
    })});
  }
  getStream(reception:EmergencyCase,hospital:Hospital|undefined){
    if(!hospital||hospital.status!=='calling')return {text:'',role:'hospital' as const};
    const batch=this.state.batches.findLast(b=>b.caseId===reception.id&&b.targets.some(t=>t.id===hospital.id));
    const phone=batch?.targets.find(t=>t.id===hospital.id)?.phone;
    const call=batch?.jobId&&this.state.jobs[batch.jobId]?.hospitals.find(h=>h.phone===phone);
    const last=call&&captionMessages(call).at(-1);
    return last?{text:last.text,role:last.role}:{text:'',role:'hospital' as const};
  }
  disconnect(){this.searching.forEach(c=>c.abort());this.searching.clear();}
}
