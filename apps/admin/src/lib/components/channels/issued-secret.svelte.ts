/** Keys just issued by create / rotate — shown once, then gone with the page. */
export interface IssuedSecret {
	channel: string;
	publishableKey: string | null;
	secretKey: string;
}

export const issued = $state<{ current: IssuedSecret | null }>({
	current: null,
});
