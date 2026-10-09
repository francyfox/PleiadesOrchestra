import { h, render } from "@/jsx/jsx.ts";

/** One radio with its label; `id` ties the label to the input. */
const Option = ({
	value,
	label,
	checked,
	disabled,
	children,
}: {
	value: string;
	label: string;
	checked: string;
	disabled: string;
	children?: unknown;
}) => (
	<div class="group">
		<label for={`pl-m-${value}`}>
			<input
				type="radio"
				name="pleiades-mode"
				value={value}
				id={`pl-m-${value}`}
				x-bind:checked={checked}
				x-bind:disabled={disabled}
				x-on:change="pickMode"
			/>
			<span x-text={label} />
		</label>
		{children}
	</div>
);

export const modeSwitchTemplate = (scope: string) =>
	render(
		<div
			class="mode"
			part="mode"
			role="radiogroup"
			x-bind:aria-label="s.mode"
			x-data={scope}
		>
			<Option
				value="webmcp"
				label="s.webmcp"
				checked="isWebmcp"
				disabled="webmcpDisabled"
			>
				<button
					type="button"
					class="hint"
					part="hint"
					aria-controls="pl-webmcp-tip"
					x-bind:aria-expanded="hintOpen"
					x-bind:aria-label="s.webmcpHint"
					x-on:click="toggleHint"
				>
					?
				</button>
			</Option>
			<Option
				value="mcp"
				label="s.mcp"
				checked="isMcp"
				disabled="mcpDisabled"
			/>
			<span
				x-bind:data-open="hintOpen"
				class="tooltip"
				part="tooltip"
				role="tooltip"
				id="pl-webmcp-tip"
			>
				<span x-text="s.webmcpHint" />{" "}
				{/* biome-ignore lint/a11y/useValidAnchor lint/a11y/useAnchorContent: href and text are Alpine bindings, filled in at runtime */}
				<a
					x-bind:href="flagUrl"
					x-text="linkText"
					part="link"
					target="_blank"
					rel="noopener"
					x-on:click="copyFlag"
				/>
			</span>
		</div>,
	);
