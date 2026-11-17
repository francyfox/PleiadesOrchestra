import type { Cue } from "./splash-pose.ts";

// Synthesised, so the intro needs no audio files: filtered noise for the slide, a pitch-dropping thud for the stamp.
export function createSplashSound() {
	let ctx: AudioContext | undefined;
	let noise: AudioBuffer | undefined;

	function setup() {
		ctx ??= new AudioContext();
		if (ctx.state === "suspended") ctx.resume().catch(() => {});
		if (!noise) {
			noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
			const d = noise.getChannelData(0);
			for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		}
		return ctx;
	}

	function slide(c: AudioContext, out: GainNode, length: number) {
		const src = c.createBufferSource();
		src.buffer = noise as AudioBuffer;
		src.loop = true;
		const band = c.createBiquadFilter();
		band.type = "bandpass";
		band.Q.value = 3;
		band.frequency.setValueAtTime(400, c.currentTime);
		band.frequency.exponentialRampToValueAtTime(
			1400,
			c.currentTime + length * 0.5,
		);
		band.frequency.exponentialRampToValueAtTime(500, c.currentTime + length);
		const env = c.createGain();
		env.gain.setValueAtTime(0, c.currentTime);
		env.gain.linearRampToValueAtTime(0.5, c.currentTime + length * 0.3);
		env.gain.linearRampToValueAtTime(0, c.currentTime + length);
		src.connect(band).connect(env).connect(out);
		src.start();
		src.stop(c.currentTime + length + 0.05);
	}

	function stamp(c: AudioContext, out: GainNode, length: number) {
		const now = c.currentTime;
		const osc = c.createOscillator();
		osc.frequency.setValueAtTime(160, now);
		osc.frequency.exponentialRampToValueAtTime(40, now + length);
		const env = c.createGain();
		env.gain.setValueAtTime(1, now);
		env.gain.exponentialRampToValueAtTime(0.001, now + length);
		osc.connect(env).connect(out);
		osc.start(now);
		osc.stop(now + length);
		slide(c, out, 0.06); // click of the plate meeting the tray
	}

	return {
		play(cue: Cue, volume: number) {
			const c = setup();
			const out = c.createGain();
			out.gain.value = volume;
			out.connect(c.destination);
			(cue.kind === "slide" ? slide : stamp)(c, out, cue.length);
		},
		close: () => ctx?.close().catch(() => {}),
	};
}
