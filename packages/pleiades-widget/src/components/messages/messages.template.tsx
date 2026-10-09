import { h, render } from "@/jsx/jsx.ts";

/** The scrolling conversation: the greeting, then one bubble per message (with its flow lines and typing dots). */
export const messagesTemplate = (scope: string) =>
	render(
		<div
			class="messages"
			part="messages"
			role="log"
			aria-live="polite"
			x-data={scope}
		>
			<div class="message assistant" x-text="greeting" />
			<div class="try" x-show="showExamples">
				<span class="try-label" x-text="s.try" />
				<template x-for="example in examples" x-bind:key="example">
					<button
						type="button"
						class="try-row"
						x-bind:data-example="example"
						x-text="example"
						x-on:click="ask"
					/>
				</template>
			</div>
			<template x-for="message in messages" x-bind:key="message.id">
				<div x-bind:class="message.cls" x-bind:data-id="message.id">
					<span class="flow">
						<template x-for="step in message.steps" x-bind:key="step.id">
							<span x-bind:class="step.cls" x-text="step.text" />
						</template>
					</span>
					<span x-text="message.content" />
					<span class="dots" aria-hidden="true">
						<i />
						<i />
						<i />
					</span>
				</div>
			</template>
		</div>,
	);
