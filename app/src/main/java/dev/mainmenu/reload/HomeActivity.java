package dev.mainmenu.reload;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.*;
import android.content.pm.*;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.media.*;
import android.os.*;
import android.provider.Settings;
import android.util.LruCache;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.*;
import java.io.*;
import java.text.Collator;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class HomeActivity extends Activity {
    private WebView web;
    private LauncherApps launcher;
    private UserManager users;
    private MenuAudio audio;
    private SharedPreferences prefs;
    private boolean ready, resumed, listening;
    private final ExecutorService catalogWorker = Executors.newSingleThreadExecutor();
    private final AtomicInteger revision = new AtomicInteger();
    private volatile Map<String, LauncherActivityInfo> activities = Collections.emptyMap();
    private String catalog = "[]";
    private final LruCache<String, byte[]> icons = new LruCache<String, byte[]>(2 * 1024 * 1024) {
        protected int sizeOf(String key, byte[] value) { return value.length; }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        launcher = getSystemService(LauncherApps.class);
        users = getSystemService(UserManager.class);
        prefs = getSharedPreferences("menu", MODE_PRIVATE);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        audio = new MenuAudio(this);
        web = new WebView(this);
        web.setSoundEffectsEnabled(false);
        web.setBackgroundColor(0xff081450);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(0xff081450);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.navigationBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime() | WindowInsets.Type.captionBar());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        frame.addView(web); setContentView(frame);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setHorizontalScrollBarEnabled(false); web.setVerticalScrollBarEnabled(false);
        boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debug);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "icons.reload.invalid".equals(uri.getHost()))
                    return icon(uri.getLastPathSegment());
                if ("file".equals(uri.getScheme()) && uri.getPath() != null && uri.getPath().startsWith("/android_asset/")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view, String url) {
                ready = true;
                pushCatalog();
                activeChanged();
            }
        });
        web.addJavascriptInterface(new Bridge(), "Phone");
        web.loadUrl("file:///android_asset/index.html");
    }

    private WebResourceResponse icon(String id) {
        byte[] bytes = icons.get(id);
        LauncherActivityInfo app = activities.get(id);
        if (bytes == null && app != null) {
            try {
                Drawable drawable = app.getBadgedIcon(160);
                Bitmap bmp = Bitmap.createBitmap(80, 80, Bitmap.Config.ARGB_8888);
                drawable.setBounds(0, 0, 80, 80); drawable.draw(new Canvas(bmp));
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.PNG, 100, stream); bmp.recycle();
                bytes = stream.toByteArray(); icons.put(id, bytes);
            } catch (RuntimeException ignored) { /* A package may be removed during decoding. */ }
        }
        return new WebResourceResponse("image/png", null, new ByteArrayInputStream(bytes == null ? new byte[0] : bytes));
    }

    private boolean usageAllowed() {
        AppOpsManager ops = getSystemService(AppOpsManager.class);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(), getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }

    private Map<String, UsageStats> recentPackages() {
        if (!usageAllowed()) return Collections.emptyMap();
        try {
            JSONObject settings = new JSONObject(prefs.getString("state", "{}"));
            if (!settings.optBoolean("recentEnabled", true) || !settings.optBoolean("drawerEnabled", true))
                return Collections.emptyMap();
            long now = System.currentTimeMillis();
            UsageStatsManager usage = getSystemService(UsageStatsManager.class);
            if (usage == null) return Collections.emptyMap();
            Map<String, UsageStats> stats = usage.queryAndAggregateUsageStats(now - TimeUnit.DAYS.toMillis(90), now);
            return stats == null ? Collections.emptyMap() : stats;
        } catch (JSONException | SecurityException | IllegalStateException ignored) {
            return Collections.emptyMap();
        }
    }

    private void refresh() {
        int ticket = revision.incrementAndGet();
        catalogWorker.execute(() -> {
            if (ticket != revision.get()) return;
            Map<String, LauncherActivityInfo> indexed = new LinkedHashMap<>();
            List<JSONObject> rows = new ArrayList<>();
            Map<String, UsageStats> usage = recentPackages();
            SharedPreferences launches = getSharedPreferences("launches", MODE_PRIVATE);
            for (UserHandle user : launcher.getProfiles()) {
                long serial = users.getSerialNumberForUser(user);
                try {
                    for (LauncherActivityInfo info : launcher.getActivityList(null, user)) {
                        ComponentName name = info.getComponentName();
                        if (getPackageName().equals(name.getPackageName())) continue;
                        String id = serial + ":" + name.flattenToShortString();
                        if (indexed.put(id, info) != null) continue;
                        JSONObject row = new JSONObject();
                        row.put("id", id); row.put("label", info.getLabel().toString());
                        row.put("pkg", name.getPackageName());
                        row.put("profile", !user.equals(android.os.Process.myUserHandle()));
                        row.put("lastLaunch", launches.getLong(id, 0));
                        UsageStats stats = row.getBoolean("profile") ? null : usage.get(name.getPackageName());
                        row.put("packageUsed", stats == null ? 0 : stats.getLastTimeUsed());
                        rows.add(row);
                    }
                } catch (SecurityException | IllegalStateException | JSONException ignored) { /* Profile unavailable. */ }
            }
            Collator order = Collator.getInstance();
            rows.sort((a, b) -> order.compare(a.optString("label"), b.optString("label")));
            String data = new JSONArray(rows).toString();
            runOnUiThread(() -> {
                if (isDestroyed() || ticket != revision.get()) return;
                activities = indexed; catalog = data; pushCatalog();
            });
        });
    }

    private final LauncherApps.Callback packages = new LauncherApps.Callback() {
        private void changed() { icons.evictAll(); refresh(); }
        public void onPackageRemoved(String p, UserHandle u) { changed(); }
        public void onPackageAdded(String p, UserHandle u) { changed(); }
        public void onPackageChanged(String p, UserHandle u) { changed(); }
        public void onPackagesAvailable(String[] p, UserHandle u, boolean replacing) { changed(); }
        public void onPackagesUnavailable(String[] p, UserHandle u, boolean replacing) { changed(); }
    };
    private void pushCatalog() { if (ready) js("receiveApps(" + JSONObject.quote(catalog) + ")"); }
    private void activeChanged() { if (ready) js("setForeground(" + resumed + ")"); }
    private void js(String code) { web.evaluateJavascript(code, null); }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if (ready && Intent.ACTION_MAIN.equals(intent.getAction())) js("goHome()");
    }
    @Override protected void onResume() {
        super.onResume(); resumed = true; audio.setForeground(true); web.onResume(); activeChanged();
        launcher.registerCallback(packages); listening = true; refresh();
    }
    @Override protected void onPause() {
        resumed = false; audio.setForeground(false); activeChanged(); web.onPause();
        if (listening) { launcher.unregisterCallback(packages); listening = false; }
        super.onPause();
    }
    @Override public void onBackPressed() { if (ready) js("goBack()"); }
    @Override protected void onDestroy() {
        ready = false; catalogWorker.shutdownNow(); audio.release(); web.destroy(); super.onDestroy();
    }

    private final class Bridge {
        @JavascriptInterface public String preferences() { return prefs.getString("state", "{}"); }
        @JavascriptInterface public void save(String state) { prefs.edit().putString("state", state).apply(); }
        @JavascriptInterface public void sound(String name) {
            runOnUiThread(() -> { if (!isDestroyed()) audio.play(name); });
        }
        @JavascriptInterface public void backgroundSound(boolean enabled) {
            runOnUiThread(() -> { if (!isDestroyed()) audio.setAmbientEnabled(enabled); });
        }
        @JavascriptInterface public void launch(String id) {
            runOnUiThread(() -> {
                LauncherActivityInfo info = activities.get(id);
                try {
                    if (info == null) throw new ActivityNotFoundException();
                    launcher.startMainActivity(info.getComponentName(), info.getUser(), null, null);
                    getSharedPreferences("launches", MODE_PRIVATE).edit()
                            .putLong(id, System.currentTimeMillis()).apply();
                } catch (RuntimeException e) {
                    Toast.makeText(HomeActivity.this, "This app is unavailable", Toast.LENGTH_SHORT).show();
                    refresh();
                }
            });
        }
        @JavascriptInterface public boolean hasUsageAccess() { return usageAllowed(); }
        @JavascriptInterface public void refreshApps() { runOnUiThread(() -> { if (!isDestroyed()) refresh(); }); }
        @JavascriptInterface public void openUsageAccess() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
                catch (ActivityNotFoundException e) {
                    Toast.makeText(HomeActivity.this, "Usage access settings unavailable", Toast.LENGTH_SHORT).show();
                }
            });
        }
        @JavascriptInterface public void defaultHome() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); }
                catch (ActivityNotFoundException e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            });
        }
    }
}
