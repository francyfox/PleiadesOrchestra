#!/usr/bin/env bun
import { createCLI } from "@bunli/core";
import adminCreate from "./commands/admin-create.ts";
import evalCommand from "./commands/eval.ts";
import reset from "./commands/reset.ts";
import send from "./commands/send.ts";

const cli = await createCLI({
	name: "albedo",
	version: "0.1.0",
	description: "CLI for talking to a running harness instance",
});

cli.command(send);
cli.command(reset);
cli.command(adminCreate);
cli.command(evalCommand);

await cli.run();
