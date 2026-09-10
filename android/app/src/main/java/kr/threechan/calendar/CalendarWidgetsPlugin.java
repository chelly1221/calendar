package kr.threechan.calendar;

import android.appwidget.AppWidgetManager;
import android.content.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import kr.threechan.calendar.widget.*;
import java.time.LocalDate;

@CapacitorPlugin(name="CalendarWidgets")
public class CalendarWidgetsPlugin extends Plugin {
    private JSObject pending;
    @Override public void load(){capture(getActivity().getIntent());}
    private synchronized void capture(Intent intent){
        String day=intent.getStringExtra("widget_date");String action=intent.getStringExtra("widget_action");
        if(day==null||action==null||!day.matches("\\d{4}-\\d{2}-\\d{2}")||!(action.equals("day")||action.equals("new")||action.equals("sync")||action.equals("event")))return;
        try{LocalDate.parse(day);}catch(Exception e){return;}
        pending=new JSObject().put("date",day).put("action",action);
        if(action.equals("event")){
            String key=intent.getStringExtra("widget_key"),rid=intent.getStringExtra("widget_recurrence_id");
            if(key==null||key.isEmpty()||key.length()>4096||rid!=null&&rid.length()>512){pending=null;return;}
            pending.put("key",key).put("recurrenceId",rid==null?"":rid);
        }
        intent.removeExtra("widget_date");intent.removeExtra("widget_action");
        intent.removeExtra("widget_key");intent.removeExtra("widget_recurrence_id");
    }
    @Override protected void handleOnNewIntent(Intent intent){capture(intent);notifyListeners("openDate",new JSObject());}
    @PluginMethod public synchronized void consumeAction(PluginCall call){
        JSObject result=new JSObject();if(pending!=null)result.put("action",pending);pending=null;call.resolve(result);
    }
    @PluginMethod public void publish(PluginCall call){
        try{
            JSObject snapshot=call.getObject("snapshot");if(snapshot==null)throw new IllegalArgumentException();
            WidgetStore.write(getContext(),snapshot);CalendarWidgetProvider.updateAll(getContext());call.resolve();
        }catch(Exception error){call.reject("위젯에 일정을 반영하지 못했어요. 앱을 다시 실행해 주세요.");}
    }
    @PluginMethod public void configure(PluginCall call){
        Integer id=call.getInt("widgetId",-1);
        if(id>=0&&!CalendarWidgetProvider.owns(getContext(),id)){call.reject("홈 화면의 위젯을 찾지 못했어요.");return;}
        getActivity().runOnUiThread(()->{
            getActivity().startActivity(new Intent(getActivity(),WidgetConfigureActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));call.resolve();
        });
    }
    @PluginMethod public void list(PluginCall call){
        AppWidgetManager manager=AppWidgetManager.getInstance(getContext());JSArray widgets=new JSArray();
        for(int id:manager.getAppWidgetIds(new ComponentName(getContext(),CalendarWidgetProvider.class))){
            WidgetConfig cfg=WidgetConfig.load(getContext(),id);
            widgets.put(new JSObject().put("id",id).put("name",cfg.flag("allCalendars",true)?"모든 일정":cfg.selected().size()+"개 캘린더"));
        }
        call.resolve(new JSObject().put("supported",android.os.Build.VERSION.SDK_INT>=26&&manager.isRequestPinAppWidgetSupported()).put("widgets",widgets));
    }
}
