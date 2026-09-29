/**
 * Spanish stress and accent rules — just enough to place written accents
 * correctly when forms are built by concatenation.
 *
 * Three things need this: attaching pronouns to commands and gerunds
 * (levanta + te → levántate), prefixing a verb onto a short one
 * (man + ten → mantén), and dropping the accent a monosyllable never carries
 * (v + ió → vio).
 */

const TO_ACCENT: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }
const TO_PLAIN: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }

export const stripAccents = (s: string) => s.replace(/[áéíóú]/g, (c) => TO_PLAIN[c])

const isVowel = (c: string | undefined) => c !== undefined && 'aeiouáéíóúü'.includes(c)
/** Accented i/u count as strong: they break a diphthong (le-í-ste, rí-o). */
const isStrong = (c: string) => 'aeoáéóíú'.includes(c)

/**
 * Syllable nuclei, each as the character indices of its vowels. Two strong
 * vowels split (le-o); anything with a weak vowel joins (sie-te, cui-da).
 */
export function nuclei(w: string): number[][] {
  const out: number[][] = []
  let cur: number[] = []
  for (let i = 0; i < w.length; i++) {
    const c = w[i]
    let vowel = isVowel(c)
    // The u in que/qui/gue/gui is silent.
    if (c === 'u' && (w[i - 1] === 'q' || w[i - 1] === 'g') && i + 1 < w.length && 'eiéí'.includes(w[i + 1])) vowel = false
    // Word-final y after a vowel closes a diphthong: hay, soy, estoy.
    if (c === 'y' && i === w.length - 1 && isVowel(w[i - 1])) vowel = true
    if (!vowel) {
      if (cur.length) out.push(cur)
      cur = []
      continue
    }
    if (cur.length && isStrong(w[cur[cur.length - 1]]) && isStrong(c)) {
      out.push(cur)
      cur = []
    }
    cur.push(i)
  }
  if (cur.length) out.push(cur)
  return out
}

/** The vowel a nucleus is stressed on: its strong vowel, else the second of two weak ones (cuí-da). */
const stressVowelOf = (w: string, n: number[]) => n.find((i) => 'aeo'.includes(w[i])) ?? n[n.length - 1]

/** Index of the stressed vowel, from the written accent or the default rules. */
export function stressedVowel(w: string): number {
  const written = w.search(/[áéíóú]/)
  if (written >= 0) return written
  const ns = nuclei(w)
  if (!ns.length) return -1
  const penultimate = 'aeiouns'.includes(w[w.length - 1]) && ns.length > 1
  return stressVowelOf(w, penultimate ? ns[ns.length - 2] : ns[ns.length - 1])
}

const accentAt = (w: string, i: number) => (TO_ACCENT[w[i]] ? w.slice(0, i) + TO_ACCENT[w[i]] + w.slice(i + 1) : w)

/**
 * Rewrite `w` so it is stressed at `target`, adding a written accent only if
 * the default rules would put the stress somewhere else.
 */
function stressAt(w: string, target: number): string {
  const bare = stripAccents(w)
  return stressedVowel(bare) === target ? bare : accentAt(bare, target)
}

/**
 * levanta + te → levántate; da + me + lo → dámelo; está + te → estate.
 * `drop` trims letters the pronoun replaces, keeping the original stress:
 * levantad − d + os → levantaos, divertid − d + os → divertíos.
 */
export const attach = (form: string, clitics: string, drop = 0) =>
  stressAt(form.slice(0, form.length - drop) + clitics, stressedVowel(form))

/** man + ten → mantén; pre + vio → previó; sonr + ío → sonrío. */
export const prefix = (pre: string, form: string) => stressAt(pre + form, pre.length + stressedVowel(form))

/** Monosyllables that keep their accent to tell them apart from another word. */
const DIACRITIC = new Set(['dé', 'sé', 'él', 'tú', 'mí', 'sí', 'más'])

/**
 * Drop the accent from a one-syllable form (vió → vio, fuí → fui, véis → veis)
 * — unless the accent marks a hiatus, as in oí and reí, which are two syllables.
 */
export function fixMonosyllable(w: string): string {
  if (DIACRITIC.has(w)) return w
  const i = w.search(/[áéíóú]/)
  if (i < 0 || nuclei(stripAccents(w)).length !== 1) return w
  const strongAt = (j: number) => j >= 0 && j < w.length && 'aeo'.includes(w[j])
  const hiatus = 'íú'.includes(w[i]) && (strongAt(i - 1) || strongAt(i + 1))
  return hiatus ? w : stripAccents(w)
}
