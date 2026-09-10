import {it,expect} from 'vitest';
import {CalDAV} from '../server/caldav';
class ExistingDav extends CalDAV {
  constructor(private isCalendar=true){super('http://radicale');}
  async request(_path:string,method:string){
    if(method==='MKCOL')return new Response('',{status:405});
    if(method==='MKCALENDAR')return new Response('<resource-must-be-null/>',{status:409});
    return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/calendar/default/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/>${this.isCalendar?'<c:calendar/>':''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
  }
}
it('reuses the existing default calendar after an API restart',async()=>{await expect(new ExistingDav().ensure()).resolves.toBeUndefined();});
it('does not accept a conflicting resource that is not a calendar',async()=>{await expect(new ExistingDav(false).ensure()).rejects.toThrow('Cannot create or confirm calendar');});
