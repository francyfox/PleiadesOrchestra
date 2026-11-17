<script lang="ts">
	import { animate, createTimeline, steps } from "animejs";

	let { active }: { active: boolean } = $props();

	let root = $state<HTMLElement>();
	let img = $state<HTMLImageElement>();
	let visible = $state(false);

	$effect(() => {
		if (!active) {
			visible = false;
			return;
		}
		visible = true;

		if (root) {
			const tl = createTimeline({
				id: "kenny",
				onComplete: () => {
					tl.reset();
				},
			});

			tl.label("start")
				.add(root, { left: "100%", ease: steps(20), duration: 5000 })
				.label("rotate");
		}

		// One hop per step: 5000 ms / 20 steps = 250 ms per cycle (up 125 + down 125).
		const hop =
			img &&
			animate(img, {
				top: ["0cqw", "-1.2cqw"],
				duration: 125,
				ease: "outQuad",
				alternate: true,
				loop: true,
			});
		return () => hop?.revert();
	});
</script>

<div id="kenny" class="kenny" class:visible bind:this={root}>
	<img bind:this={img} src="/movie/kenny.gif" alt="Kenny, running in" />
</div>

<style>
.kenny {
	position: absolute;
	bottom: 3%;
	left: -20%;
	width: 14cqw;
	display: none;
	pointer-events: none;
}
.kenny.visible { display: block; }
.kenny img { position: relative; width: 100%; height: auto; display: block; }
</style>
