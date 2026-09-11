import ICAL from 'ical.js';
import { calendarComponent, masterOf, validateEvent } from './ical';
import { eventColor } from './event-color';

export type DeviceEvent = Record<string, string | number | null> & { _id:number; calendar_id:number; dtstart:number; allDay:number };
export type DeviceFamily = { id:string; source:string; version:string; records:DeviceEvent[] };
export function deviceFamilyToIcal(family:DeviceFamily,device:string,zones:Record<string,string>):string {
  const cal=new ICAL.Component(['vcalendar',[],[]]);cal.updatePropertyWithValue('version','2.0');cal.updatePropertyWithValue('prodid','-//3chan//Device Calendar//KO');
  const added=new Set<string>();
  for(const row of family.records){const id=String(row.eventTimezone||'UTC');if(!added.has(id)&&zones[id]){
    const zone=calendarComponent('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+zones[id]+'END:VCALENDAR').getFirstSubcomponent('vtimezone');if(zone)cal.addSubcomponent(zone);added.add(id);
  }}
  const master=family.records.find(row=>row.original_id==null);if(!master)throw new Error('반복 일정의 원본을 찾지 못했어요.');
  const uid=String(master.uid2445||`device-${device}-${family.id}@calendar.3chan.kr`);
  for(const row of [master,...family.records.filter(r=>r!==master)]){
    const c=new ICAL.Component('vevent');c.updatePropertyWithValue('uid',uid);c.updatePropertyWithValue('dtstamp',ICAL.Time.fromJSDate(new Date(0),true));
    c.updatePropertyWithValue('summary',String(row.title||''));c.updatePropertyWithValue('description',String(row.description||''));c.updatePropertyWithValue('location',String(row.eventLocation||''));
    const zoneId=String(row.eventTimezone||'UTC'),zone=zoneId==='UTC'?ICAL.Timezone.utcTimezone:ICAL.TimezoneService.get(zoneId);
    if(!zone)throw new Error(`시간대를 읽지 못했어요: ${zoneId}`);
    const time=(ms:number,allDay=Boolean(row.allDay))=>{
      const t=ICAL.Time.fromJSDate(new Date(ms),true);if(allDay)return ICAL.Time.fromDateString(t.toString().slice(0,10));return t.convertToZone(zone);
    };
    const setTime=(name:string,value:ICAL.Time)=>{c.updatePropertyWithValue(name,value);if(!value.isDate&&value.zone.tzid!=='UTC'&&value.zone.tzid!=='floating')c.getFirstProperty(name)!.setParameter('tzid',value.zone.tzid);};
    setTime('dtstart',time(row.dtstart));
    if(row.duration)c.updatePropertyWithValue('duration',ICAL.Duration.fromString(String(row.duration)));
    else if(row.dtend!=null)setTime('dtend',time(Number(row.dtend)));
    else throw new Error('일정의 종료 시간을 읽지 못했어요.');
    for(const rule of ['rrule','exrule'])if(row[rule])c.updatePropertyWithValue(rule,ICAL.Recur.fromString(String(row[rule])));
    for(const name of ['rdate','exdate'])if(row[name]){
      let raw=String(row[name]),tz=zoneId;const semicolon=raw.indexOf(';');if(semicolon>=0){tz=raw.slice(0,semicolon);raw=raw.slice(semicolon+1);}
      for(const value of raw.split(',')){
        const property=ICAL.Property.fromString(`${name.toUpperCase()}${/^\d{8}$/.test(value)?';VALUE=DATE':''}:${value}`);
        if(!value.endsWith('Z')&&!/^\d{8}$/.test(value))property.setParameter('tzid',tz);
        c.addProperty(property);
      }
    }
    if(row.originalInstanceTime!=null){let rid=time(Number(row.originalInstanceTime),Boolean(row.originalAllDay));const masterZone=ICAL.TimezoneService.get(String(master.eventTimezone||'UTC'));if(!rid.isDate&&masterZone)rid=rid.convertToZone(masterZone);setTime('recurrence-id',rid);}
    if(row.eventStatus===2)c.updatePropertyWithValue('status','CANCELLED');else if(row.eventStatus===0)c.updatePropertyWithValue('status','TENTATIVE');else c.updatePropertyWithValue('status','CONFIRMED');
    c.updatePropertyWithValue('transp',row.availability===1?'TRANSPARENT':'OPAQUE');
    if(row.accessLevel===2)c.updatePropertyWithValue('class','PRIVATE');else if(row.accessLevel===3)c.updatePropertyWithValue('class','PUBLIC');else if(row.accessLevel===1)c.updatePropertyWithValue('class','CONFIDENTIAL');
    if(row.eventColor!=null)c.updatePropertyWithValue('color','#'+(Number(row.eventColor)&0xffffff).toString(16).padStart(6,'0'));
    cal.addSubcomponent(c);
  }
  const result=cal.toString();validateEvent(result);return result;
}
export function icalToDeviceEvents(text:string):Record<string,string|number|null>[] {
  const cal=calendarComponent(text),master=masterOf(cal);if(!master)throw new Error('일정이 없어요.');
  const items=[master,...cal.getAllSubcomponents('vevent').filter(c=>c!==master)];
  return items.map(c=>{
    const event=new ICAL.Event(c);const date=(t:ICAL.Time)=>t.isDate?Date.UTC(t.year,t.month-1,t.day):+t.toJSDate();
    const rrule=c.getFirstPropertyValue('rrule')?.toString()||null;
    const dates=(name:string)=>{
      const values=c.getAllProperties(name).flatMap(p=>p.getValues() as ICAL.Time[]);if(!values.length)return null;
      // Calendar Provider accepts UTC date-time lists; DATE exclusions use UTC midnight.
      return values.map(t=>ICAL.Time.fromJSDate(new Date(date(t)),true).toICALString()).join(',');
    };
    const rdate=dates('rdate'),recurring=Boolean(rrule||rdate),color=eventColor(c.getFirstPropertyValue('color'));
    const zone=event.startDate.isDate?'UTC':event.startDate.zone.tzid==='floating'?Intl.DateTimeFormat().resolvedOptions().timeZone:event.startDate.zone.tzid;
    const rid=c.getFirstPropertyValue('recurrence-id') as ICAL.Time|null;
    const status=String(c.getFirstPropertyValue('status')||'CONFIRMED').toUpperCase(),access=String(c.getFirstPropertyValue('class')||'').toUpperCase();
    if(!Number.isFinite(date(event.startDate))||!Number.isFinite(date(event.endDate)))throw new Error('기기 캘린더에 기록할 날짜를 확인해 주세요.');
    return {title:event.summary||'',description:event.description||'',eventLocation:event.location||'',dtstart:date(event.startDate),dtend:recurring?null:date(event.endDate),duration:recurring?event.duration.toString():null,allDay:event.startDate.isDate?1:0,eventTimezone:zone,eventEndTimezone:zone,rrule,rdate,exrule:c.getFirstPropertyValue('exrule')?.toString()||null,exdate:dates('exdate'),eventStatus:status==='CANCELLED'?2:status==='TENTATIVE'?0:1,availability:c.getFirstPropertyValue('transp')==='TRANSPARENT'?1:0,accessLevel:access==='PRIVATE'?2:access==='PUBLIC'?3:access==='CONFIDENTIAL'?1:0,eventColor:color?parseInt('ff'+color.slice(1),16):null,originalInstanceTime:rid?date(rid):null,originalAllDay:rid?(rid.isDate?1:0):null};
  });
}
