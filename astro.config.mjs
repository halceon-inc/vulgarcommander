// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: vercel(),
	env: {
		schema: {
			OLLAMA_BASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
			OLLAMA_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
			OLLAMA_MODEL: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
				default: 'gemma4:31b',
			}),
			MOTHERDUCK_TOKEN: envField.string({ context: 'server', access: 'secret' }),
			MOTHERDUCK_HOST: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
				default: 'pg.us-west-2-aws.motherduck.com',
			}),
		},
	},
});
