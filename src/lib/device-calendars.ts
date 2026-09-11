import { Capacitor, registerPlugin } from '@capacitor/core';
import { db as defaultDB, saveEvent, deleteEvent, type CalendarDB } from './database';
import { conflictCopy, sameEvent } from './ical';
import { deviceFamilyToIcal, icalToDeviceEvents, type DeviceFamily } from './device-calendar-data';

export type DeviceSelection={id:string;mode:'read'|'two-way'};
export type DeviceSource={id:string;name:string;account:string;type:string;color:string;writable:boolean};
export type DeviceStatus={granted:boolean;writeGranted:boolean;device:string;sources:DeviceSource[];selected:DeviceSelection[];lastSync:number};
export interface DevicePlugin {
 status():Promise<DeviceStatus>;requestAccess(input:{write:boolean}):Promise<DeviceStatus>;openPermissions():Promise<void>;
 configure(input:{sources:DeviceSelection[]}):Promise<DeviceStatus>;
 scan():Promise<{families:DeviceFamily[];zones:Record<string,string>;scanned:string[]}>;
 write(input:{source:string;id?:string;key:string;version?:string;events:Record<string,string|number|null>[]}):Promise<{id:string;version:string;records:DeviceFamily['records'];conflict:boolean}>;
 remove(input:{source:string;id:string;version:string}):Promise<{conflict:boolean}>;
 completed():Promise<DeviceStatus>;
}
const native=registerPlugin<DevicePlugin>('DeviceCalendars');
export const deviceCalendarsAvailable=()=>Capacitor.getPlatform()==='android'||typeof window!=='undefined'&&Boolean(window.BackgroundSyncNative);
async function call<K extends keyof DevicePlugin>(method:K,input:unknown={}):Promise<Awaited<ReturnType<DevicePlugin[K]>>>{
 if(typeof window!=='undefined'&&window.BackgroundSyncNative){const data=JSON.parse(window.BackgroundSyncNative.invoke('device:'+method,JSON.stringify(input)));if(data.error)throw new Error(data.error);return data.result;}
 return (native[method] as (input:unknown)=>Promise<Awaited<ReturnType<DevicePlugin[K]>>>)(input);
}
export const deviceCalendarStatus=()=>call('status');
export const requestDeviceCalendarAccess=(write=false)=>call('requestAccess',{write});
export const openDeviceCalendarPermissions=()=>call('openPermissions');
export const configureDeviceCalendars=(sources:DeviceSelection[])=>call('configure',{sources});
export const deviceCalendarId=(device:string,source:string)=>`device-${device}-${source}`;
type Link={id:string;source:string;key:string;version:string;local:string};
/** Caller owns calendar-sync so foreground and scheduled runs cannot race a provider write. */
export async function syncDeviceCalendars(database:CalendarDB=defaultDB,transport?:DevicePlugin){
 if(!transport&&!deviceCalendarsAvailable())return;
 const invoke=transport?<K extends keyof DevicePlugin>(method:K,input:unknown={})=>(transport[method] as (input:unknown)=>Promise<Awaited<ReturnType<DevicePlugin[K]>>>)(input):call;
 const status=await invoke('status');if(!status.selected.length)return;
 if(!status.granted)throw new Error('기기 캘린더 읽기 권한이 꺼졌어요. 설정에서 다시 허용해 주세요.');
 const snapshot=await invoke('scan');
 const prefix=`device:${status.device}:`;
 const meta=await database.meta.filter(row=>row.key.startsWith(prefix)).toArray();
 const links=new Map(meta.map(row=>{const link=JSON.parse(row.value) as Link;return [link.id,link] as const;}));
 const linkedKeys=new Set([...links.values()].map(l=>l.key));let failures=0;
 for(const selected of status.selected){
  const source=status.sources.find(s=>s.id===selected.id);if(!source||!snapshot.scanned.includes(source.id)){failures++;continue;}
  const calendarId=deviceCalendarId(status.device,source.id),old=await database.calendars.get(calendarId);
  await database.calendars.put({id:calendarId,name:source.name+' · '+(source.account||'기기'),color:source.color,hidden:old?.hidden});
  const remember=async(link:Link)=>{await database.meta.put({key:prefix+link.id,value:JSON.stringify(link)});linkedKeys.add(link.key);};
  for(const family of snapshot.families.filter(f=>f.source===source.id)){
   try{
    const imported=deviceFamilyToIcal(family,status.device,snapshot.zones);let link=links.get(family.id);
    if(!link){const key=`${calendarId}/device-${family.id}.ics`;const current=await database.events.get(key);if(current&&!sameEvent(current.ical,imported))await saveEvent(conflictCopy(current.ical),'default',undefined,database);if(!current||!sameEvent(current.ical,imported))await saveEvent(imported,calendarId,key,database);link={id:family.id,source:source.id,key,version:family.version,local:imported};await remember(link);}
    const current=await database.events.get(link.key);
    if(!current||current.deleted){
     if(selected.mode==='two-way'){
      if(!status.writeGranted||!source.writable)throw new Error('쓰기 권한 필요');
      if(family.version!==link.version){
       // A changed or reused provider row must never be deleted by an older tombstone.
       const restored=conflictCopy(imported);await saveEvent(restored,calendarId,link.key,database);await remember({...link,version:family.version,local:restored});
      }else{const removed=await invoke('remove',{source:source.id,id:family.id,version:link.version});if(removed.conflict)failures++;}
     }
     continue;
    }
    const localChanged=!sameEvent(current.ical,link.local),deviceChanged=family.version!==link.version;
    if(deviceChanged){
     await database.transaction('rw',database.events,async()=>{const latest=await database.events.get(link!.key);if(latest&&latest.version!==current.version)throw new Error('동시에 수정 중');if(localChanged&&!sameEvent(current.ical,imported))await saveEvent(conflictCopy(current.ical),'default',undefined,database);await saveEvent(imported,calendarId,link!.key,database);});
     await remember({...link,version:family.version,local:imported});
    }else if(localChanged&&selected.mode==='two-way'){
     if(!status.writeGranted||!source.writable)throw new Error('쓰기 권한 필요');
     const result=await invoke('write',{source:source.id,id:family.id,key:link.key,version:family.version,events:icalToDeviceEvents(current.ical)});
     if(result.conflict){failures++;continue;}
     await remember({...link,version:result.version,local:current.ical});
    }
   }catch{failures++;}
  }
  const existingIds=new Set(snapshot.families.filter(f=>f.source===source.id).map(f=>f.id));
  // Absence counts as deletion only after a complete scan of a still-present, permitted calendar.
  for(const link of links.values())if(link.source===source.id&&!existingIds.has(link.id)){
   const current=await database.events.get(link.key);if(!current||current.deleted)continue;
   await database.transaction('rw',database.events,async()=>{
    const latest=await database.events.get(link.key);if(!latest||latest.deleted)return;
    if(!sameEvent(latest.ical,link.local))await saveEvent(conflictCopy(latest.ical),'default',undefined,database);
    await deleteEvent(link.key,database);
   });
  }
  if(selected.mode==='two-way')for(const event of await database.events.where('calendarId').equals(calendarId).toArray()){
   if(event.deleted||linkedKeys.has(event.key))continue;
   try{
    if(!status.writeGranted||!source.writable)throw new Error('쓰기 권한 필요');
    const result=await invoke('write',{source:source.id,key:event.key,events:icalToDeviceEvents(event.ical)});if(result.conflict){failures++;continue;}
    await remember({id:result.id,source:source.id,key:event.key,version:result.version,local:event.ical});
   }catch{failures++;}
  }
 }
 if(failures)throw new Error(`${failures}개 기기 일정의 동기화를 보류했어요. 원본은 유지했어요. 권한·반복 예외를 확인해 주세요.`);
 await invoke('completed');
}
