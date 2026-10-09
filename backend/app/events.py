"""Coalesced state events. Reconnect gets a snapshot; updates contain changed jobs."""
import asyncio
import json
from contextlib import asynccontextmanager


class DispatchEvents:
    def __init__(self):
        self.listeners = {}

    @staticmethod
    def wake(event, dirty, job_id):
        dirty.add(job_id)
        event.set()

    def notify(self, job_id):
        # Store commits may run on the caption writer's thread.
        for event, (loop, dirty) in tuple(self.listeners.items()):
            if not loop.is_closed():
                loop.call_soon_threadsafe(self.wake, event, dirty, job_id)

    @asynccontextmanager
    async def subscribe(self):
        event, dirty = asyncio.Event(), set()
        self.listeners[event] = (asyncio.get_running_loop(), dirty)
        try:
            yield event, dirty
        finally:
            self.listeners.pop(event, None)

    async def stream(self, snapshot, updates=None):
        async with self.subscribe() as (changed, dirty):
            data = await asyncio.to_thread(snapshot)
            yield 'event: snapshot\ndata: ' + json.dumps(data, ensure_ascii=False) + '\n\n'
            while True:
                try:
                    await asyncio.wait_for(changed.wait(), 15)
                except TimeoutError:
                    yield ': heartbeat\n\n'
                    continue
                await asyncio.sleep(.05)
                ids = set(dirty)
                dirty.clear()
                changed.clear()
                data = await asyncio.to_thread(updates, ids) if updates else await asyncio.to_thread(snapshot)
                if data is not None:
                    kind = 'update' if updates else 'snapshot'
                    yield f'event: {kind}\ndata: ' + json.dumps(data, ensure_ascii=False) + '\n\n'
