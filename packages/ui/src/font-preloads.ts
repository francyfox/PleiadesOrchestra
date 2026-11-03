/**
 * URLs of the Poppins faces a page shows first, for `<link rel="preload" as="font">`.
 * Same files as `fonts.css` imports, so the bundler emits each once and the preload
 * is the request the @font-face uses.
 */

export { default as poppinsRegular } from "@fontsource/poppins/files/poppins-latin-400-normal.woff2?url";
export { default as poppinsBold } from "@fontsource/poppins/files/poppins-latin-700-normal.woff2?url";
