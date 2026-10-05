export const modeSwitchTemplate = (scope: string) => `
<div class="mode" part="mode" role="radiogroup" :aria-label="s.mode" x-data="${scope}">
	<label for="pl-m-webmcp">
		<input type="radio" name="pleiades-mode" value="webmcp" id="pl-m-webmcp" :checked="isWebmcp" @change="pickMode" />
		<span x-text="s.webmcp"></span>
		<button type="button" class="hint" part="hint" aria-describedby="pl-webmcp-tip" :aria-label="s.webmcpHint">?<span class="tooltip" part="tooltip" role="tooltip" id="pl-webmcp-tip" x-text="s.webmcpHint"></span></button>
	</label>
	<label for="pl-m-mcp">
		<input type="radio" name="pleiades-mode" value="mcp" id="pl-m-mcp" :checked="isMcp" @change="pickMode" />
		<span x-text="s.mcp"></span>
	</label>
</div>`;
