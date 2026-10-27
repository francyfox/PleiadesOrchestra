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
					<span class="quote" x-show="message.quote" x-text="message.quote" />
					<span class="body">
						<template x-for="part in message.parts" x-bind:key="part.key">
							<span>
								<span x-show="part.isText" x-text="part.text" />
								{/* biome-ignore lint/a11y/useAnchorContent: the title and href are bound by Alpine */}
								{/* biome-ignore lint/a11y/useValidAnchor: the title and href are bound by Alpine */}
								<a
									class="link"
									part="link"
									target="_blank"
									rel="noopener noreferrer"
									x-show="part.isLink"
									x-bind:href="part.href"
									x-text="part.text"
								/>
							</span>
						</template>
					</span>
					<span class="options">
						<template x-for="option in message.choices" x-bind:key="option.key">
							<button
								type="button"
								class="try-row option"
								part="option"
								x-bind:data-n="option.n"
								x-bind:aria-label="option.label"
								x-bind:aria-keyshortcuts="option.n"
								x-on:click="pick"
							>
								<kbd x-text="option.n" />
								<span x-text="option.text" />
							</button>
						</template>
						<template x-for="option in message.listed" x-bind:key="option.key">
							<span class="option listed">
								<kbd x-text="option.n" />
								<span x-text="option.text" />
							</span>
						</template>
					</span>
					<time
						class="stamp"
						aria-live="off"
						x-show="message.time"
						x-bind:datetime="message.iso"
						x-bind:title="message.title"
						x-text="message.time"
					/>
					<span class="dots" aria-hidden="true">
						<i />
						<i />
						<i />
					</span>
				</div>
			</template>
		</div>,
	);
