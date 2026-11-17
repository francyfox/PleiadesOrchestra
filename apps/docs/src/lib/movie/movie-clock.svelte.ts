import { MUSIC_AT } from "./movie.storyboard.ts";

// Playback clock: the music is the master once it runs, before that a rAF timer.
export function useClock(audio: () => HTMLAudioElement, duration: number) {
	let t = $state(0);
	let started = $state(false);
	let playing = $state(false);
	let raf = 0;
	let last = 0;

	function syncAudio() {
		const a = audio();
		if (t < MUSIC_AT) return a.pause();
		if (!playing) return;
		// the clip ends before the credits do: play() on an ended track would restart the music and the clock
		// a.ended too: MUSIC_AT + duration - MUSIC_AT can round below duration and slip past the check
		if (a.ended || t - MUSIC_AT >= a.duration) return;
		if (a.paused) a.play().catch(() => {});
		else if (Math.abs(a.currentTime - (t - MUSIC_AT)) > 0.3)
			a.currentTime = t - MUSIC_AT;
	}

	function tick(now: number) {
		raf = requestAnimationFrame(tick);
		const dt = (now - last) / 1000;
		last = now;
		const a = audio();
		t = t >= MUSIC_AT && !a.paused ? MUSIC_AT + a.currentTime : t + dt;
		if (t >= duration) return pause(duration);
		if (t >= MUSIC_AT && a.paused) syncAudio();
	}

	function play() {
		if (t >= duration) seek(0);
		started = playing = true;
		last = performance.now();
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);
		syncAudio();
	}

	function pause(at = t) {
		playing = false;
		t = at;
		cancelAnimationFrame(raf);
		audio().pause();
	}

	function seek(to: number) {
		t = to;
		audio().currentTime = Math.max(0, to - MUSIC_AT);
		if (to < MUSIC_AT) audio().pause();
		else syncAudio();
	}

	return {
		get t() {
			return t;
		},
		get started() {
			return started;
		},
		get playing() {
			return playing;
		},
		get ended() {
			return t >= duration;
		},
		play,
		pause,
		seek,
		stop: () => cancelAnimationFrame(raf),
	};
}
