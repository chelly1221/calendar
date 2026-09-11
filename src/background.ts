import { db } from "./lib/database";
import { syncNow, getSync } from "./lib/sync";
import { runBackgroundSync } from "./lib/background-runner";
import { buildWidgetData } from "./lib/widget-data";
import { syncDeviceCalendars } from "./lib/device-calendars";
declare global { interface Window { BackgroundSyncNative?: { invoke(method:string,input:string):string } } }
const bridge=window.BackgroundSyncNative;
const invoke=(method:string,args:unknown)=>{const result=JSON.parse(bridge!.invoke(method,JSON.stringify(args)));if(result.error)throw new Error(result.error);};
const admitted=async()=>Boolean((await db.meta.get('profile'))?.value);
const publishWidget=async()=>{const [records,calendars,last]=await Promise.all([db.events.toArray(),db.calendars.toArray(),db.meta.get("lastSync")]);invoke("publishWidget",{snapshot:buildWidgetData(records,calendars,Number(last?.value)||0)});};
if(bridge)void (async()=>{
 if(await admitted()){
  // A temporarily unreachable private server must not prevent local calendar/widget refresh.
  await navigator.locks.request('calendar-sync',()=>syncDeviceCalendars()).catch(()=>{});
  await publishWidget();
 }
 return runBackgroundSync(admitted,async()=>{
 const before=getSync().lastSync;
 await syncNow();
 return !getSync().error&&getSync().lastSync>before;
},publishWidget);
})().catch(()=>"retry").then(outcome=>invoke("finish",{outcome}));
