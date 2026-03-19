import { Agent, InputGuardrail, run } from '@openai/agents';
import z from 'zod';

import { GUARDRAIL_MODEL } from './config';
import { buildGuardrailInstructions } from './prompt';

const helpfulGuardrailAgent = new Agent({
    name: 'Helpful Guardrail',
    instructions: buildGuardrailInstructions,
    outputType: z.object({
        isHelpful: z.boolean(),
        reasoning: z.string(),
    }),
    model: GUARDRAIL_MODEL,
});

export const helpfulInputGuardrail: InputGuardrail = {
    name: 'Helpful input guardrail',
    runInParallel: false,
    execute: async ({ input, context }) => {
        const result = await run(helpfulGuardrailAgent, input, { context });
        return {
            outputInfo: result.finalOutput,
            tripwireTriggered: result.finalOutput?.isHelpful === false,
        };
    },
};
