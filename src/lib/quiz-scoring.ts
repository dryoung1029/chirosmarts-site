/**
 * Quiz scoring (compliance-relevant: the 80% final-exam gate, PLAN.md §3).
 *
 * Pure + unit-tested. `quiz_attempts` is the sole, append-only system of record;
 * this function computes the score that gets snapshotted into an attempt. It
 * never touches the DB.
 *
 * Grading rules by question type:
 *  - single_choice / true_false: exactly the one correct option must be chosen.
 *  - multi_choice: the chosen set must equal the correct set exactly (all
 *    correct options and no incorrect ones) — partial credit is not given.
 */

export type QuestionType = "single_choice" | "multi_choice" | "true_false";

export interface ScorableOption {
  id: string;
  isCorrect: boolean;
}
export interface ScorableQuestion {
  id: string;
  type: QuestionType;
  options: ScorableOption[];
}

/** Map of questionId → the option ids the user selected. */
export type AnswerMap = Record<string, string[]>;

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  selected: string[];
}
export interface ScoreResult {
  score: number; // 0..1 = correct questions / total
  correctCount: number;
  total: number;
  perQuestion: QuestionResult[];
}

function gradeQuestion(q: ScorableQuestion, selected: string[]): boolean {
  const correctIds = new Set(
    q.options.filter((o) => o.isCorrect).map((o) => o.id),
  );
  // Only count selections that are real options of this question.
  const validIds = new Set(q.options.map((o) => o.id));
  const chosen = new Set(selected.filter((id) => validIds.has(id)));

  if (chosen.size !== correctIds.size) return false;
  for (const id of chosen) if (!correctIds.has(id)) return false;
  return true;
}

/** Score an attempt. Unanswered questions count as incorrect. */
export function scoreAttempt(
  questions: ScorableQuestion[],
  answers: AnswerMap,
): ScoreResult {
  const perQuestion: QuestionResult[] = [];
  let correctCount = 0;
  for (const q of questions) {
    const selected = answers[q.id] ?? [];
    const correct = gradeQuestion(q, selected);
    if (correct) correctCount++;
    perQuestion.push({ questionId: q.id, correct, selected });
  }
  const total = questions.length;
  return {
    score: total === 0 ? 0 : correctCount / total,
    correctCount,
    total,
    perQuestion,
  };
}

/** Did the attempt meet the pass threshold? (Final exam: default 0.80.) */
export function isPassing(score: number, threshold: number): boolean {
  // Guard floating-point: 0.8 exactly should pass at threshold 0.8.
  return score >= threshold - 1e-9;
}
