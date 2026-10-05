/** The scrolling conversation: the greeting, then one bubble per message (with its flow lines and typing dots). */
export const messagesTemplate = (scope: string) => `
<div class="messages" part="messages" role="log" aria-live="polite" x-data="${scope}">
	<div class="message assistant" x-text="greeting"></div>
	<template x-for="message in messages" :key="message.id">
		<div :class="message.cls" :data-id="message.id">
			<span class="flow">
				<template x-for="step in message.steps" :key="step.id">
					<span :class="step.cls" x-text="step.text"></span>
				</template>
			</span>
			<span x-text="message.content"></span>
			<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
		</div>
	</template>
</div>`;
