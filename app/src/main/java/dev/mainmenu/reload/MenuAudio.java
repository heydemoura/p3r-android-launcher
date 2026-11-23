package dev.mainmenu.reload;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.os.SystemClock;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** All calls, including SoundPool load callbacks, run on the activity's main thread. */
final class MenuAudio {
    private final AudioManager manager;
    private final SoundPool cues;
    private final Map<String, Integer> samples = new HashMap<>();
    private final Set<Integer> loaded = new HashSet<>();
    private final Context context;
    private final AudioAttributes music;
    private MediaPlayer background;
    private final AudioFocusRequest focusRequest;
    private boolean foreground, ambientEnabled, hasRequest, otherMedia;
    private int pending;
    private long pendingAt, lastFocusCue;

    MenuAudio(Context context) {
        this.context = context.getApplicationContext();
        manager = context.getSystemService(AudioManager.class);
        AudioAttributes effects = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        cues = new SoundPool.Builder().setMaxStreams(4).setAudioAttributes(effects).build();
        cues.setOnLoadCompleteListener((pool, sample, status) -> {
            if (status != 0) return;
            loaded.add(sample);
            if (sample == pending && foreground && SystemClock.uptimeMillis() - pendingAt < 250) {
                cues.play(sample, 1f, 1f, 1, 0, 1f);
                pending = 0;
            }
        });
        samples.put("focus", cues.load(context, R.raw.focus, 1));
        samples.put("confirm", cues.load(context, R.raw.confirm, 1));
        samples.put("back", cues.load(context, R.raw.back, 1));
        samples.put("dialog", cues.load(context, R.raw.dialog, 1));

        music = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(music).setOnAudioFocusChangeListener(this::focusChanged).build();
    }

    void play(String name) {
        Integer sample = samples.get(name);
        if (!foreground || sample == null) return;
        long now = SystemClock.uptimeMillis();
        if (name.equals("focus")) {
            if (now - lastFocusCue < 65) return;
            lastFocusCue = now;
        }
        pending = 0;
        if (loaded.contains(sample)) cues.play(sample, 1f, 1f, 1, 0, 1f);
        else { pending = sample; pendingAt = now; }
    }

    void setForeground(boolean active) {
        foreground = active;
        if (active) otherMedia = manager.isMusicActive();
        else pending = 0;
        updateBackground();
    }

    void setAmbientEnabled(boolean enabled) {
        ambientEnabled = enabled;
        updateBackground();
    }

    private void updateBackground() {
        if (!foreground || !ambientEnabled || otherMedia) {
            releaseFocus();
            return;
        }
        if (hasRequest) return;
        if (background == null) {
            background = MediaPlayer.create(context, R.raw.menu_background, music, AudioManager.AUDIO_SESSION_ID_GENERATE);
            if (background == null) return;
            background.setOnErrorListener((player, what, extra) -> {
                // A media-server restart or lost output route invalidates this player.
                // A subsequent resume or explicit enable will create a fresh one.
                if (background == player) { background = null; releaseFocus(); }
                player.release();
                return true;
            });
            background.setLooping(true);
        }
        hasRequest = manager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (hasRequest) startBackground();
    }

    private void startBackground() {
        background.setVolume(.82f, .82f);
        background.start();
    }

    private void focusChanged(int change) {
        if (!hasRequest || background == null) return;
        switch (change) {
            case AudioManager.AUDIOFOCUS_GAIN:
                if (foreground && ambientEnabled) startBackground();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                background.setVolume(.16f, .16f);
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                if (background.isPlaying()) background.pause();
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                otherMedia = true;
                releaseFocus();
                break;
        }
    }

    private void releaseFocus() {
        if (background != null && background.isPlaying()) background.pause();
        if (hasRequest) {
            hasRequest = false;
            manager.abandonAudioFocusRequest(focusRequest);
        }
    }

    void release() {
        foreground = false;
        releaseFocus();
        cues.release();
        if (background != null) background.release();
    }
}
