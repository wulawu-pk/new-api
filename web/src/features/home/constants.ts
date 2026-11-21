/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ShowcaseModel } from './hooks/use-showcase-models'

/**
 * Theme tokens handed to canvas/WebGL effects on the landing surface.
 * Module-level constant: `useCssColors` caches on its identity.
 */
export const LANDING_COLOR_VARS = {
  accent: '--landing-accent',
  foreground: '--foreground',
  background: '--background',
  muted: '--muted-foreground',
  border: '--border',
}

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** One button pair and one text link for every landing call to action. */
export const landingAction = {
  primary: `group bg-foreground text-background hover:bg-foreground/85 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-[background-color,transform] duration-200 active:scale-[0.98] sm:w-auto ${focusRing}`,
  secondary: `border-border bg-background/70 hover:bg-muted inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border px-6 text-sm font-medium backdrop-blur transition-[background-color,transform] duration-200 active:scale-[0.98] sm:w-auto ${focusRing}`,
  text: `group text-foreground inline-flex h-11 items-center gap-1.5 rounded-full text-sm font-medium ${focusRing}`,
}

/**
 * Shown when this instance publishes no catalog (empty, sign-in gated or
 * unreachable). Real model ids from the providers the gateway supports.
 */
export const FALLBACK_MODELS: ShowcaseModel[] = [
  {
    name: 'gpt-4.1',
    vendor: 'OpenAI',
    icon: 'OpenAI',
    endpoints: ['openai', 'openai-response'],
  },
  {
    name: 'gpt-4o',
    vendor: 'OpenAI',
    icon: 'OpenAI',
    endpoints: ['openai', 'openai-response'],
  },
  {
    name: 'o3',
    vendor: 'OpenAI',
    icon: 'OpenAI',
    endpoints: ['openai-response'],
  },
  {
    name: 'claude-sonnet-4-5',
    vendor: 'Anthropic',
    icon: 'Claude.Color',
    endpoints: ['anthropic', 'openai'],
  },
  {
    name: 'claude-opus-4-1',
    vendor: 'Anthropic',
    icon: 'Claude.Color',
    endpoints: ['anthropic', 'openai'],
  },
  {
    name: 'gemini-2.5-pro',
    vendor: 'Google',
    icon: 'Gemini.Color',
    endpoints: ['gemini', 'openai'],
  },
  {
    name: 'gemini-2.5-flash',
    vendor: 'Google',
    icon: 'Gemini.Color',
    endpoints: ['gemini', 'openai'],
  },
  {
    name: 'deepseek-chat',
    vendor: 'DeepSeek',
    icon: 'DeepSeek.Color',
    endpoints: ['openai', 'anthropic'],
  },
  {
    name: 'deepseek-reasoner',
    vendor: 'DeepSeek',
    icon: 'DeepSeek.Color',
    endpoints: ['openai'],
  },
  {
    name: 'qwen3-max',
    vendor: 'Qwen',
    icon: 'Qwen.Color',
    endpoints: ['openai'],
  },
  {
    name: 'doubao-seed-1-6',
    vendor: 'ByteDance',
    icon: 'Doubao.Color',
    endpoints: ['openai'],
  },
  {
    name: 'kimi-k2',
    vendor: 'Moonshot',
    icon: 'Kimi',
    endpoints: ['openai', 'anthropic'],
  },
  {
    name: 'glm-4.6',
    vendor: 'Zhipu',
    icon: 'Zhipu.Color',
    endpoints: ['openai', 'anthropic'],
  },
  { name: 'grok-4', vendor: 'xAI', icon: 'Grok', endpoints: ['openai'] },
  {
    name: 'text-embedding-3-large',
    vendor: 'OpenAI',
    icon: 'OpenAI',
    endpoints: ['embeddings'],
  },
]

/** Upstream providers the gateway relays to, for the marquee rows. */
export const PROVIDER_ROWS: { name: string; icon: string }[][] = [
  [
    { name: 'OpenAI', icon: 'OpenAI' },
    { name: 'Anthropic', icon: 'Claude.Color' },
    { name: 'Google Gemini', icon: 'Gemini.Color' },
    { name: 'Azure OpenAI', icon: 'Azure.Color' },
    { name: 'AWS Bedrock', icon: 'Bedrock.Color' },
    { name: 'Vertex AI', icon: 'VertexAI.Color' },
    { name: 'Mistral', icon: 'Mistral.Color' },
  ],
  [
    { name: 'DeepSeek', icon: 'DeepSeek.Color' },
    { name: 'Qwen', icon: 'Qwen.Color' },
    { name: 'Doubao', icon: 'Doubao.Color' },
    { name: 'Kimi', icon: 'Kimi' },
    { name: 'Zhipu GLM', icon: 'Zhipu.Color' },
    { name: 'MiniMax', icon: 'Minimax.Color' },
    { name: 'Hunyuan', icon: 'Hunyuan.Color' },
  ],
  [
    { name: 'xAI Grok', icon: 'Grok' },
    { name: 'Cohere', icon: 'Cohere.Color' },
    { name: 'OpenRouter', icon: 'OpenRouter' },
    { name: 'SiliconCloud', icon: 'SiliconCloud.Color' },
    { name: 'Ollama', icon: 'Ollama' },
    { name: 'Cloudflare', icon: 'Cloudflare.Color' },
    { name: 'Midjourney', icon: 'Midjourney' },
  ],
]
