/**
 * ═══════════════════════════════════════════════════════════════
 * Model Priority Manager
 * ═══════════════════════════════════════════════════════════════
 * 
 * Manages the priority order of AI models for auto-switching.
 * When credits run low on the current model, this module determines
 * which model to try next based on a configurable priority list.
 * 
 * Falls back to the model with the highest available credits
 * if all priority-ordered models are exhausted.
 */

import * as vscode from 'vscode';

// ─── Types ───────────────────────────────────────────────────

/** Represents credit counts keyed by model name */
export type ModelCredits = Record<string, number>;

// ─── Default Priority Order ──────────────────────────────────

/**
 * Default model priority array.
 * Models are tried in this order when auto-switching.
 * Users can customize this via settings or the sidebar drag-and-drop UI.
 */
export const DEFAULT_MODEL_PRIORITY: string[] = [
    'claude-sonnet',
    'claude-haiku',
    'gemini-pro',
    'gemini-flash'
];

// ─── Priority Functions ──────────────────────────────────────

/**
 * Gets the current model priority from VS Code settings.
 * Falls back to DEFAULT_MODEL_PRIORITY if no custom order is set.
 * 
 * @returns The ordered array of model names
 */
export function getModelPriority(): string[] {
    const config = vscode.workspace.getConfiguration('antigravityHub');
    const priority = config.get<string[]>('autoSwitch.modelPriority');
    return priority && priority.length > 0 ? priority : DEFAULT_MODEL_PRIORITY;
}

/**
 * Finds the next available model with credits > 0, following priority order.
 * 
 * Decision logic:
 *   1. Start from the model AFTER currentModel in the priority list
 *   2. Wrap around the list if needed
 *   3. Return the first model with credits > 0
 *   4. If no model in priority has credits, fall back to highest credits
 *   5. If ALL models have 0 credits, return null
 * 
 * @param currentModel  - The model currently in use
 * @param modelCredits  - Map of model name → remaining credits
 * @param priorityOrder - Optional custom priority order (defaults to settings)
 * @returns The next model name with available credits, or null if all exhausted
 */
export function getNextAvailableModel(
    currentModel: string,
    modelCredits: ModelCredits,
    priorityOrder?: string[]
): string | null {
    const priority = priorityOrder || getModelPriority();

    // Find current model's position in the priority list
    const currentIndex = priority.indexOf(currentModel);

    // ── Step 1: Try models after current in priority order ──
    // Start from the next model and wrap around the full list
    for (let i = 1; i < priority.length; i++) {
        const nextIndex = (currentIndex + i) % priority.length;
        const candidateModel = priority[nextIndex];
        const credits = modelCredits[candidateModel];

        // Skip the current model, skip models with no credits
        if (candidateModel !== currentModel && credits !== undefined && credits > 0) {
            return candidateModel;
        }
    }

    // ── Step 2: Fallback — find model with highest credits ──
    // This catches models that exist in modelCredits but NOT in the priority list
    return getHighestCreditsModel(currentModel, modelCredits);
}

/**
 * Finds the model with the highest available credits (excluding current model).
 * Used as a fallback when all priority-ordered models are exhausted.
 * 
 * @param currentModel - The model to exclude from selection
 * @param modelCredits - Map of model name → remaining credits
 * @returns The model name with highest credits, or null if all are 0
 */
export function getHighestCreditsModel(
    currentModel: string,
    modelCredits: ModelCredits
): string | null {
    let bestModel: string | null = null;
    let bestCredits = 0;

    for (const [model, credits] of Object.entries(modelCredits)) {
        // Skip the current model
        if (model === currentModel) {
            continue;
        }

        // Track the model with the most credits
        if (credits > bestCredits) {
            bestCredits = credits;
            bestModel = model;
        }
    }

    return bestModel;
}

/**
 * Calculates total credits across all models for an account.
 * Useful for determining if an account has ANY credits remaining.
 * 
 * @param modelCredits - Map of model name → remaining credits
 * @returns Total credits across all models
 */
export function getTotalCredits(modelCredits: ModelCredits): number {
    return Object.values(modelCredits).reduce((sum, credits) => sum + credits, 0);
}

/**
 * Saves a custom model priority order to VS Code settings.
 * Called when the user reorders models via the sidebar drag-and-drop UI.
 * 
 * @param order - The new priority order array
 */
export async function saveModelPriority(order: string[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('antigravityHub');
    await config.update(
        'autoSwitch.modelPriority',
        order,
        vscode.ConfigurationTarget.Global
    );
}
