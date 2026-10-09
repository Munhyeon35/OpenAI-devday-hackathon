"use client";

import { useEffect, useState, useSyncExternalStore } from 'react';
import { DEMO_CASES } from '@/lib/dashboard/demo-data';
import { DispatchController } from '@/lib/dashboard/dispatch-controller';
import type { EmergencyCase, Hospital, Patient } from '@/lib/dashboard/types';
import type { HospitalSearch } from '@/lib/hospitals';
import type { DispatchJob } from '@/lib/dashboard/live-data';

// Keep the component's existing hook contract; only its data source changes.
// Example patient cards remain editable, but fabricated hospital calls/results do not.
const initialCases:EmergencyCase[]=DEMO_CASES.map(reception=>({...reception,status:'draft',hospitals:[],logs:[],
  candidateSearch:{status:'draft',parameters:{latitude:reception.position[0],longitude:reception.position[1],
    radiusKm:20,limit:10,departments:[],procedures:[],equipment:[],beds:[],includeUnknown:true}}}));
export function useDemoDashboard(){
  const [controller]=useState(()=>new DispatchController(initialCases));
  const [demoRouting,setDemoRouting]=useState(false);
  const [mode,setMode]=useState<'live'|'demo'|null>(null);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{
    controller.restore(window.sessionStorage);
    const abort=new AbortController();
    void fetch('/api/config',{signal:abort.signal}).then(async response=>{
      if(response.ok){const config=await response.json();if(config.mode==='live'||config.mode==='demo'){controller.setDemoTargets(config.demo_call_targets || null);setDemoRouting(Boolean(config.demo_call_targets));controller.setMode(config.mode);setMode(config.mode);}}
    }).catch(()=>{});
    const stream=new EventSource('/api/dispatches/events');
    const receive=(event:MessageEvent)=>{try{
      const data=JSON.parse(event.data) as {dispatches:DispatchJob[]};
      if(Array.isArray(data.dispatches))controller.receive(data.dispatches);
    }catch{/* Reconnect receives a fresh snapshot; never redial. */}};
    stream.addEventListener('snapshot',receive);stream.addEventListener('update',receive);
    let previous=Date.now();
    const interval=window.setInterval(()=>{const now=Date.now();controller.tick(now,(now-previous)/1000);previous=now;},1000);
    return()=>{abort.abort();stream.close();window.clearInterval(interval);controller.disconnect();};
  },[controller]);
  const report=(error:unknown)=>window.alert(error instanceof Error?error.message:'요청을 처리하지 못했습니다.');
  return {cases:state.cases,mode,demoRouting,
    getStream:(reception:EmergencyCase,hospital:Hospital|undefined)=>controller.getStream(reception,hospital),
    addCase:(reception:EmergencyCase)=>controller.addCase(reception),
    savePatient:(caseId:string,patient:Patient)=>controller.savePatient(caseId,patient),
    searchHospitals:(caseId:string,patient:Patient,parameters:HospitalSearch)=>controller.searchHospitals(caseId,patient,parameters).catch(report),
    startDemoCalls:(caseId:string)=>{void controller.startCalls(caseId,()=>true).catch(report);},
    retryCall:(caseId:string,hospitalId:string)=>{void controller.startCalls(caseId,()=>true,hospitalId).catch(report);}};
}
