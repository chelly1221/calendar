import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { deviceCalendarsAvailable, deviceCalendarStatus, requestDeviceCalendarAccess, configureDeviceCalendars, openDeviceCalendarPermissions, type DeviceSelection, type DeviceStatus } from './lib/device-calendars';
import { syncNow } from './lib/sync';

export default function DeviceCalendarSettings(){
 const [state,setState]=useState<DeviceStatus>();const [selection,setSelection]=useState<DeviceSelection[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[denied,setDenied]=useState(false);
 const refresh=async()=>{const value=await deviceCalendarStatus();setState(value);setSelection(value.selected);if(value.granted)setDenied(false);};
 useEffect(()=>{
  if(!deviceCalendarsAvailable())return;
  void refresh().catch(()=>setError('기기 캘린더 목록을 읽지 못했어요. 다시 확인해 주세요.'));
  const listener=App.addListener('appStateChange',({isActive})=>{if(isActive)void refresh().catch(()=>{});});
  return()=>{void listener.then(l=>l.remove());};
 },[]);
 if(!deviceCalendarsAvailable())return null;
 const act=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'기기 캘린더 설정을 확인해 주세요.');}finally{setBusy(false);}};
 const request=()=>act(async()=>{const next=await requestDeviceCalendarAccess();setState(next);setSelection(next.selected);setDenied(!next.granted);if(!next.granted)setError('캘린더 읽기 권한이 필요해요. 요청 창이 나오지 않으면 앱 권한 설정에서 허용해 주세요.');});
 const save=()=>act(async()=>{
  if(selection.some(s=>s.mode==='two-way')&&!state?.writeGranted){const next=await requestDeviceCalendarAccess(true);setState(next);if(!next.writeGranted){setDenied(true);throw new Error('양방향으로 반영하려면 캘린더 쓰기 권한이 필요해요.');}}
  const next=await configureDeviceCalendars(selection);setState(next);setSelection(next.selected);await syncNow();setMessage('선택한 캘린더를 연결했어요. 서버 연결 전에도 기기 일정을 읽을 수 있어요.');
 });
 return <section className="device-calendar-settings" aria-label="기기 캘린더 연결">
  <h3>이 기기의 다른 캘린더</h3>
  <p>Google·삼성·기기 저장소 등 Android에 등록된 캘린더를 선택해 달력 앱과 서버에 함께 보관해요.</p>
  {!state?<button type="button" disabled={busy} onClick={()=>void act(refresh)}>캘린더 목록 다시 확인</button>:!state.granted?<button type="button" disabled={busy} onClick={()=>void request()}>기기 캘린더 읽기 허용</button>:<>
   {state.sources.length===0&&<p>등록된 캘린더가 없어요. 기기의 계정 설정에서 캘린더 동기화를 켠 뒤 다시 확인해 주세요.</p>}
   {state.sources.length>0&&<><div className="device-calendar-list">{state.sources.map(source=><label key={source.id} className="device-calendar-row">
    <span><strong><i aria-hidden="true" style={{backgroundColor:source.color}}/>{source.name||'이름 없는 캘린더'}</strong><small>{source.account||'기기 저장소'}{!source.writable?' · 읽기 전용':''}</small></span>
    <select aria-label={`${source.name} 연결 방식`} disabled={busy} value={selection.find(s=>s.id===source.id)?.mode||'off'} onChange={e=>setSelection(rows=>[...rows.filter(s=>s.id!==source.id),...(e.target.value==='off'?[]:[{id:source.id,mode:e.target.value as DeviceSelection['mode']}])])}>
     <option value="off">연결 안 함</option><option value="read">가져오기</option>{source.writable&&<option value="two-way">양방향 동기화</option>}
    </select>
   </label>)}</div>
   <p className="device-calendar-detail">가져오기는 원본의 추가·수정·삭제를 반영해요. 양방향은 이 캘린더에서 만든 일정·수정·삭제도 원본에 반영해요. 삭제와 수정이 겹치면 수정 내용은 사본으로 남겨요. 연결을 꺼도 이미 가져온 일정은 남아요.</p>
   <p className="device-calendar-detail">회의 참석자와 초대 응답은 원래 캘린더 앱에서 관리해 주세요. 다른 앱이 Android에 공개하지 않는 캘린더는 목록에 나타나지 않을 수 있어요.</p>
   <div className="device-calendar-actions"><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'연결 설정 중…':'선택한 캘린더 연결'}</button><button type="button" disabled={busy} onClick={()=>void act(refresh)}>목록 새로 확인</button></div></>}
   {state.sources.length===0&&<button type="button" disabled={busy} onClick={()=>void act(refresh)}>목록 새로 확인</button>}
   {state.lastSync>0&&<small>최근 기기 동기화 · {new Date(state.lastSync).toLocaleString('ko-KR')}</small>}
  </>}
  {denied&&<button type="button" disabled={busy} onClick={()=>void act(openDeviceCalendarPermissions)}>앱 권한 설정 열기</button>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
