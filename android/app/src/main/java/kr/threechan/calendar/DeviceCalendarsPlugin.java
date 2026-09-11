package kr.threechan.calendar;
import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="DeviceCalendars",permissions={@Permission(alias="read",strings={Manifest.permission.READ_CALENDAR}),@Permission(alias="write",strings={Manifest.permission.WRITE_CALENDAR})})
public class DeviceCalendarsPlugin extends Plugin {
    private final java.util.concurrent.ExecutorService executor=Executors.newSingleThreadExecutor();
    interface Work {org.json.JSONObject run(DeviceCalendars calendars)throws Exception;}
    private void execute(PluginCall call,Work work){executor.execute(()->{try{call.resolve(JSObject.fromJSONObject(work.run(new DeviceCalendars(getContext()))));}catch(Exception e){call.reject(e instanceof SecurityException||e instanceof IllegalArgumentException?e.getMessage():"기기 캘린더를 처리하지 못했어요. 권한과 계정을 다시 확인해 주세요.");}});}
    @PluginMethod public void status(PluginCall call){execute(call,DeviceCalendars::sources);}
    @PluginMethod public void requestAccess(PluginCall call){
        boolean write=Boolean.TRUE.equals(call.getBoolean("write",false));DeviceCalendars calendars=new DeviceCalendars(getContext());
        if(write?calendars.writable():calendars.readable()){status(call);return;}
        requestPermissionForAlias(write?"write":"read",call,"permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call){status(call);}
    @PluginMethod public void openPermissions(PluginCall call){getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName())));call.resolve();}
    @PluginMethod public void configure(PluginCall call){execute(call,c->{c.configure(call.getArray("sources",new JSArray()));return c.sources();});}
    @PluginMethod public void scan(PluginCall call){execute(call,DeviceCalendars::scan);}
    @PluginMethod public void write(PluginCall call){execute(call,c->c.write(call.getData()));}
    @PluginMethod public void remove(PluginCall call){execute(call,c->c.remove(call.getData()));}
    @PluginMethod public void completed(PluginCall call){execute(call,c->{c.completed();return c.sources();});}
    @Override protected void handleOnDestroy(){executor.shutdown();}
}
