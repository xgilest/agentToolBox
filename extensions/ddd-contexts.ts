import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import fs from "node:fs";
import path from "node:path";

const PLANNING_DIR = ".planning";
const CONTEXTS_DIR = path.join(PLANNING_DIR, "contexts");

function projectRoot(): string {
	return process.cwd();
}

function contextsRoot(): string {
	return path.join(projectRoot(), CONTEXTS_DIR);
}

function contextDir(context: string): string {
	return path.join(contextsRoot(), context);
}

function assertSafeContextName(context: string): void {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(context)) {
		throw new Error(`Invalid context name: ${context}. Use letters, numbers, _ or -.`);
	}
}

function listContexts(): string[] {
	const root = contextsRoot();
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function readTextIfExists(file: string): string | null {
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function initContext(context: string): "created" | "exists" {
	assertSafeContextName(context);
	const dir = contextDir(context);
	const existed = fs.existsSync(dir);
	fs.mkdirSync(dir, { recursive: true });

	const rulesPath = path.join(dir, "rules.md");
	const statePath = path.join(dir, "STATE.md");

	if (!fs.existsSync(rulesPath)) {
		fs.writeFileSync(
			rulesPath,
			`# ${context} Context Rules\n\n## Lenguaje ubicuo\n- Define aquí el vocabulario estricto del contexto.\n\n## Límites del contexto\n- Este contexto no debe depender de detalles internos de otros bounded contexts.\n- La integración con otros contextos debe hacerse mediante contratos públicos, DTOs o eventos.\n\n## Arquitectura\n- Mantener separadas las reglas de dominio, aplicación e infraestructura.\n\n## Testing\n- Toda regla de negocio nueva requiere tests.\n`,
			"utf8",
		);
	}

	if (!fs.existsSync(statePath)) {
		fs.writeFileSync(
			statePath,
			`# ${context} Context State\n\n## Estado actual\n- Contexto inicializado.\n\n## Decisiones vigentes\n- Pendiente de completar.\n\n## Última actualización\n- ${new Date().toISOString().slice(0, 10)}: Creada memoria inicial del contexto ${context}.\n`,
			"utf8",
		);
	}

	return existed ? "exists" : "created";
}

function buildCoordinatorPrompt(ticket: string, mode: "plan" | "run"): string {
	const contexts = listContexts();
	const inventory = contexts
		.map((context) => {
			const dir = contextDir(context);
			return [
				`## Context: ${context}`,
				`### rules.md`,
				readTextIfExists(path.join(dir, "rules.md")) ?? "(missing)",
				`### STATE.md`,
				readTextIfExists(path.join(dir, "STATE.md")) ?? "(missing)",
			].join("\n");
		})
		.join("\n\n---\n\n");

	if (mode === "plan") {
		return `Actúa como Arquitecto Coordinador DDD.\n\nTicket:\n${ticket}\n\nContextos disponibles y memoria actual:\n${inventory || "(no hay contextos; sugiere ejecutar /ddd:init)"}\n\nGenera un plan ordenado por dependencias entre bounded contexts. Para cada paso incluye: context, task, dependencies, risks y tests sugeridos. No implementes todavía.`;
	}

	return `Actúa como Coordinador DDD y ejecuta el ciclo completo para este ticket.\n\nTicket:\n${ticket}\n\nContextos disponibles y memoria actual:\n${inventory || "(no hay contextos; pide al usuario crear contextos con /ddd:init)"}\n\nFlujo obligatorio:\n1. Genera primero un plan ordenado por dependencias entre bounded contexts.\n2. Ejecuta contexto por contexto. Para cada contexto afectado:\n   - Lee y respeta .planning/contexts/<context>/rules.md.\n   - Lee .planning/contexts/<context>/STATE.md antes de modificar.\n   - Implementa solo cambios dentro de los límites del contexto.\n   - Ejecuta tests relevantes.\n   - Actualiza .planning/contexts/<context>/STATE.md con cambios, decisiones y tests ejecutados.\n3. Si detectas dependencia entre contextos, conserva contratos públicos y evita importar modelos internos de otro contexto.\n4. Al final, entrega resumen breve con archivos modificados y tests.`;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("ddd:init", {
		description: "Create .planning/contexts memory for bounded contexts. Usage: /ddd:init billing users",
		handler: async (args, ctx) => {
			const contexts = args.split(/\s+/).map((value) => value.trim()).filter(Boolean);
			if (contexts.length === 0) {
				ctx.ui.notify("Usage: /ddd:init <context> [context...]", "warning");
				return;
			}

			try {
				const results = contexts.map((context) => `${context}: ${initContext(context)}`);
				ctx.ui.notify(`DDD contexts initialized: ${results.join(", ")}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerCommand("ddd:contexts", {
		description: "List DDD bounded contexts from .planning/contexts.",
		handler: async (_args, ctx) => {
			const contexts = listContexts();
			ctx.ui.notify(contexts.length ? `DDD contexts: ${contexts.join(", ")}` : "No DDD contexts found. Run /ddd:init <context>.", "info");
		},
	});

	pi.registerCommand("ddd:state", {
		description: "Ask the agent to summarize one context state. Usage: /ddd:state billing",
		handler: async (args, ctx) => {
			const context = args.trim();
			if (!context) {
				ctx.ui.notify("Usage: /ddd:state <context>", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy. Try again when idle.", "warning");
				return;
			}

			try {
				assertSafeContextName(context);
				const state = readTextIfExists(path.join(contextDir(context), "STATE.md"));
				if (!state) {
					ctx.ui.notify(`Context not found or STATE.md missing: ${context}`, "error");
					return;
				}
				pi.sendUserMessage(`Resume el estado del bounded context '${context}' usando este STATE.md:\n\n${state}`);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerCommand("ddd:plan", {
		description: "Plan a DDD ticket across bounded contexts without implementing. Usage: /ddd:plan <ticket>",
		handler: async (args, ctx) => {
			const ticket = args.trim();
			if (!ticket) {
				ctx.ui.notify("Usage: /ddd:plan <ticket>", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy. Try again when idle.", "warning");
				return;
			}
			pi.sendUserMessage(buildCoordinatorPrompt(ticket, "plan"));
		},
	});

	pi.registerCommand("ddd:run", {
		description: "Run a DDD ticket across bounded contexts and update STATE.md files. Usage: /ddd:run <ticket>",
		handler: async (args, ctx) => {
			const ticket = args.trim();
			if (!ticket) {
				ctx.ui.notify("Usage: /ddd:run <ticket>", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy. Try again when idle.", "warning");
				return;
			}
			pi.sendUserMessage(buildCoordinatorPrompt(ticket, "run"));
		},
	});

	pi.registerTool({
		name: "ddd_contexts",
		label: "DDD Contexts",
		description: "List/read/init DDD bounded-context memory in .planning/contexts.",
		parameters: Type.Object({
			action: StringEnum(["list", "read", "init"] as const),
			context: Type.Optional(Type.String({ description: "Context name for read/init" })),
		}),
		async execute(_toolCallId, params) {
			try {
				if (params.action === "list") {
					return { content: [{ type: "text", text: JSON.stringify({ contexts: listContexts() }, null, 2) }] };
				}

				if (!params.context) {
					return { content: [{ type: "text", text: "Error: context is required for this action." }] };
				}

				assertSafeContextName(params.context);

				if (params.action === "init") {
					return { content: [{ type: "text", text: `${params.context}: ${initContext(params.context)}` }] };
				}

				const dir = contextDir(params.context);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									context: params.context,
									rules: readTextIfExists(path.join(dir, "rules.md")),
									state: readTextIfExists(path.join(dir, "STATE.md")),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
			}
		},
	});
}
