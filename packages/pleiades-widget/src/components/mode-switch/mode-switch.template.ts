export const modeSwitchTemplate = (scope: string) => `
<div class="mode" part="mode" role="radiogroup" :aria-label="s.mode" x-data="${scope}">
  <div class="group">
      <label for="pl-m-webmcp">
      <input type="radio" name="pleiades-mode" value="webmcp" id="pl-m-webmcp" :checked="isWebmcp" @change="pickMode" />
      <span x-text="s.webmcp"></span>
    </label>
    <button type="button" class="hint" part="hint" aria-describedby="pl-webmcp-tip" :aria-label="s.webmcpHint">
        ?
        <span x-text="s.webmcpHint" class="tooltip" part="tooltip" role="tooltip" id="pl-webmcp-tip"></span>
    </button>
  </div>
  <div class="group">
    <label for="pl-m-mcp">
      <input type="radio" name="pleiades-mode" value="mcp" id="pl-m-mcp" :checked="isMcp" @change="pickMode" />
      <span x-text="s.mcp"></span>
    </label>
  </div>
</div>`;
