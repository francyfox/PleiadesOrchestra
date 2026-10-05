export const composerTemplate = (scope: string) => `
<form part="composer" x-data="${scope}" @submit.prevent="submit">
	<textarea rows="1" part="input" x-model="draft" :maxlength="maxChars" :placeholder="placeholder"
		:aria-label="placeholder" :disabled="inputDisabled" @keydown="onKey"></textarea>
	<button type="submit" part="send" :class="sendClass" :disabled="sendDisabled" :aria-label="sendAria" x-text="sendLabel"></button>
</form>`;
