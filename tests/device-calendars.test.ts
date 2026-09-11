import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarDB, saveEvent, deleteEvent } from '../src/lib/database';
import { deviceFamilyToIcal, icalToDeviceEvents, type DeviceEvent, type DeviceFamily } from '../src/lib/device-calendar-data';
import { syncDeviceCalendars, deviceCalendarId, type DevicePlugin, type DeviceStatus } from '../src/lib/device-calendars';
import { expandEvent, readEvent, writeEvent } from '../src/lib/ical';
const row=(overrides:Partial<DeviceEvent>={}):DeviceEvent=>({_id:10,calendar_id:1,title:'기기 일정',description:'본문',eventLocation:'서울',dtstart:Date.UTC(2026,8,11,9),dtend:Date.UTC(2026,8,11,10),allDay:0,eventTimezone:'UTC',original_id:null,originalInstanceTime:null,eventStatus:1,...overrides});
const family=(overrides:Partial<DeviceFamily>={}):DeviceFamily=>({id:'10',source:'1',version:'v1',records:[row()],...overrides});
const databases:CalendarDB[]=[];
afterEach(async()=>{for(const db of databases.splice(0))await db.delete();});
function fixture(mode:'read'|'two-way'='read'){
 const db=new CalendarDB('device-test-'+crypto.randomUUID());databases.push(db);
 const state:DeviceStatus={granted:true,writeGranted:true,device:'test-device',sources:[{id:'1',name:'개인',account:'기기',type:'LOCAL',color:'#ff0000',writable:true}],selected:[{id:'1',mode}],lastSync:0};
 const snapshot={families:[family()],zones:{},scanned:['1']};
 const transport={status:vi.fn(async()=>state),scan:vi.fn(async()=>snapshot),write:vi.fn(async(input)=>({id:input.id||'20',version:'written',records:[row()],conflict:false})),remove:vi.fn(async()=>({conflict:false})),completed:vi.fn(async()=>state)} as unknown as DevicePlugin;
 return {db,state,snapshot,transport};
}
it('keeps all-day dates exclusive and event colors intact',()=>{
 const ical=deviceFamilyToIcal(family({records:[row({allDay:1,dtstart:Date.UTC(2026,8,11),dtend:Date.UTC(2026,8,13),eventColor:0xff123456})]}),'device',{});
 expect(ical).toContain('DTSTART;VALUE=DATE:20260911');expect(ical).toContain('DTEND;VALUE=DATE:20260913');expect(ical).toContain('COLOR:#123456');
 expect(icalToDeviceEvents(ical)[0]).toMatchObject({dtstart:Date.UTC(2026,8,11),dtend:Date.UTC(2026,8,13),allDay:1,eventColor:0xff123456});
});
it('keeps recurrence exceptions and cancellations as one CalDAV resource',()=>{
 const ical=deviceFamilyToIcal(family({records:[row({dtend:null,duration:'PT1H',rrule:'FREQ=DAILY;COUNT=3'}),row({_id:11,original_id:10,originalInstanceTime:Date.UTC(2026,8,12,9),dtstart:Date.UTC(2026,8,12,11),dtend:Date.UTC(2026,8,12,12),title:'변경한 일정',eventColor:0xff00ff00})]}),'device',{});
 const events=expandEvent(ical,'key',new Date('2026-09-10'),new Date('2026-09-15'));
 expect(events).toHaveLength(3);expect(events[1].title).toBe('변경한 일정');expect(events[1].start.toISOString()).toBe('2026-09-12T11:00:00.000Z');
 const output=icalToDeviceEvents(ical);expect(output[0]).toMatchObject({duration:'PT1H',dtend:null,rrule:'FREQ=DAILY;COUNT=3'});expect(output[1].originalInstanceTime).toBe(Date.UTC(2026,8,12,9));
});
it('uses the timezone definition across a daylight-saving transition',()=>{
 const zones={'America/New_York':'BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nBEGIN:STANDARD\r\nDTSTART:20251102T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:20260308T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\n'};
 const ical=deviceFamilyToIcal(family({records:[row({eventTimezone:'America/New_York',dtstart:Date.UTC(2026,2,7,14),dtend:null,duration:'PT1H',rrule:'FREQ=DAILY;COUNT=3'})]}),'device',zones);
 const events=expandEvent(ical,'key',new Date('2026-03-07'),new Date('2026-03-11'));expect(events.map(e=>e.start.getUTCHours()),ical).toEqual([14,13,13]);
 expect(icalToDeviceEvents(ical)[0]).toMatchObject({eventTimezone:'America/New_York',dtstart:Date.UTC(2026,2,7,14)});
});
it('imports selected calendars offline and retries without duplicate events',async()=>{
 const f=fixture();await syncDeviceCalendars(f.db,f.transport);await syncDeviceCalendars(f.db,f.transport);
 expect(await f.db.events.count()).toBe(1);expect((await f.db.calendars.toArray())[0].color).toBe('#ff0000');expect(f.transport.write).not.toHaveBeenCalled();
});
it('does not even scan when no sources are selected or reading is denied',async()=>{
 const f=fixture();f.state.selected=[];await syncDeviceCalendars(f.db,f.transport);expect(f.transport.scan).not.toHaveBeenCalled();
 f.state.selected=[{id:'1',mode:'read'}];f.state.granted=false;await expect(syncDeviceCalendars(f.db,f.transport)).rejects.toThrow('읽기 권한');expect(f.transport.scan).not.toHaveBeenCalled();
});
it('preserves simultaneous edits in a conflict copy before accepting device changes',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);const original=(await f.db.events.toArray())[0];
 await saveEvent(writeEvent({...readEvent(original.ical),title:'서버 수정'},original.ical),original.calendarId,original.key,f.db);
 f.snapshot.families=[family({version:'v2',records:[row({title:'기기 수정'})]})];await syncDeviceCalendars(f.db,f.transport);
 const events=await f.db.events.toArray();expect(events).toHaveLength(2);expect(events.map(e=>readEvent(e.ical).title)).toEqual(expect.arrayContaining(['기기 수정','서버 수정 (충돌 사본)']));expect(f.transport.write).not.toHaveBeenCalled();
});
it('writes changed and newly created app events only in two-way mode',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);const original=(await f.db.events.toArray())[0];
 await saveEvent(writeEvent({...readEvent(original.ical),title:'앱 수정'},original.ical),original.calendarId,original.key,f.db);
 await syncDeviceCalendars(f.db,f.transport);expect(f.transport.write).toHaveBeenCalledWith(expect.objectContaining({source:'1',id:'10',version:'v1',events:[expect.objectContaining({title:'앱 수정'})]}));
 await saveEvent(writeEvent({...readEvent(original.ical),uid:'new',title:'새 일정'}),deviceCalendarId('test-device','1'),undefined,f.db);await syncDeviceCalendars(f.db,f.transport);
 expect(f.transport.write).toHaveBeenCalledWith(expect.objectContaining({source:'1',events:[expect.objectContaining({title:'새 일정'})]}));
});
it('propagates an app deletion with a version check only in two-way mode',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);const original=(await f.db.events.toArray())[0];await deleteEvent(original.key,f.db);await syncDeviceCalendars(f.db,f.transport);
 expect(f.transport.remove).toHaveBeenCalledWith({source:'1',id:'10',version:'v1'});
 const read=fixture();await syncDeviceCalendars(read.db,read.transport);await deleteEvent((await read.db.events.toArray())[0].key,read.db);await syncDeviceCalendars(read.db,read.transport);expect(read.transport.remove).not.toHaveBeenCalled();
});
it('does not mistake an unavailable account for deleted events',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);f.snapshot.families=[];f.snapshot.scanned=[];
 await expect(syncDeviceCalendars(f.db,f.transport)).rejects.toThrow('보류');expect((await f.db.events.toArray())[0].deleted).toBe(false);expect(f.transport.remove).not.toHaveBeenCalled();
});
it('propagates a confirmed device deletion and preserves concurrent local edits',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);const original=(await f.db.events.toArray())[0];await saveEvent(writeEvent({...readEvent(original.ical),title:'아직 전송 중'},original.ical),original.calendarId,original.key,f.db);
 f.snapshot.families=[];await syncDeviceCalendars(f.db,f.transport);expect((await f.db.events.get(original.key))?.deleted).toBe(true);
 expect((await f.db.events.toArray()).filter(e=>!e.deleted).map(e=>readEvent(e.ical).title)).toEqual(['아직 전송 중 (충돌 사본)']);
});
it('never deletes a changed or reused provider row using an older app tombstone',async()=>{
 const f=fixture('two-way');await syncDeviceCalendars(f.db,f.transport);const original=(await f.db.events.toArray())[0];await deleteEvent(original.key,f.db);
 f.snapshot.families=[family({version:'v2',records:[row({title:'삭제와 겹친 수정'})]})];await syncDeviceCalendars(f.db,f.transport);
 expect(f.transport.remove).not.toHaveBeenCalled();const restored=await f.db.events.get(original.key);expect(restored?.deleted).toBe(false);expect(readEvent(restored!.ical).title).toBe('삭제와 겹친 수정 (충돌 사본)');
});
