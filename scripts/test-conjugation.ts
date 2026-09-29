/**
 * Golden tables for the conjugation engine, taken from the conjugation
 * reference pages. Covers every rule the engine has at least once.
 *   npm run test:conjugation
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConjugator, type Person, type TenseId, type VerbSpecs } from '../engine/conjugate.ts'
import { createChecker, difference, explain, normalize, type Diagnosis } from '../engine/check.ts'
import { ROOT } from './lib/compile.ts'

const specs = JSON.parse(readFileSync(join(ROOT, 'content', 'verbs.json'), 'utf8')) as VerbSpecs
const c = createConjugator(specs)

/** [verb, tense, the six forms space-separated ("-" for no form), reflexive?] */
type Case = [string, TenseId, string, boolean?]

const CASES: Case[] = [
  // Regular -ar / -er / -ir
  ['hablar', 'presente', 'hablo hablas habla hablamos habláis hablan'],
  ['comer', 'presente', 'como comes come comemos coméis comen'],
  ['vivir', 'presente', 'vivo vives vive vivimos vivís viven'],
  ['hablar', 'preterito', 'hablé hablaste habló hablamos hablasteis hablaron'],
  ['comer', 'preterito', 'comí comiste comió comimos comisteis comieron'],
  ['hablar', 'imperfecto', 'hablaba hablabas hablaba hablábamos hablabais hablaban'],
  ['vivir', 'imperfecto', 'vivía vivías vivía vivíamos vivíais vivían'],
  ['hablar', 'futuro', 'hablaré hablarás hablará hablaremos hablaréis hablarán'],
  ['comer', 'condicional', 'comería comerías comería comeríamos comeríais comerían'],
  ['hablar', 'subj-presente', 'hable hables hable hablemos habléis hablen'],
  ['vivir', 'subj-presente', 'viva vivas viva vivamos viváis vivan'],
  ['hablar', 'subj-imperfecto', 'hablara hablaras hablara habláramos hablarais hablaran'],
  ['comer', 'subj-imperfecto', 'comiera comieras comiera comiéramos comierais comieran'],
  ['hablar', 'imperativo', '- habla hable hablemos hablad hablen'],
  ['comer', 'imperativo-negativo', '- no comas no coma no comamos no comáis no coman'],

  // Compound tenses
  ['hablar', 'perfecto', 'he hablado has hablado ha hablado hemos hablado habéis hablado han hablado'],
  ['hacer', 'pluscuamperfecto', 'había hecho habías hecho había hecho habíamos hecho habíais hecho habían hecho'],
  ['volver', 'futuro-perfecto', 'habré vuelto habrás vuelto habrá vuelto habremos vuelto habréis vuelto habrán vuelto'],
  ['decir', 'condicional-compuesto', 'habría dicho habrías dicho habría dicho habríamos dicho habríais dicho habrían dicho'],
  ['ver', 'subj-perfecto', 'haya visto hayas visto haya visto hayamos visto hayáis visto hayan visto'],
  ['saber', 'subj-pluscuamperfecto', 'hubiera sabido hubieras sabido hubiera sabido hubiéramos sabido hubierais sabido hubieran sabido'],

  // Stem changes
  ['pensar', 'presente', 'pienso piensas piensa pensamos pensáis piensan'],
  ['pensar', 'subj-presente', 'piense pienses piense pensemos penséis piensen'],
  ['poder', 'presente', 'puedo puedes puede podemos podéis pueden'],
  ['jugar', 'presente', 'juego juegas juega jugamos jugáis juegan'],
  ['jugar', 'preterito', 'jugué jugaste jugó jugamos jugasteis jugaron'],
  ['jugar', 'subj-presente', 'juegue juegues juegue juguemos juguéis jueguen'],
  ['oler', 'presente', 'huelo hueles huele olemos oléis huelen'],
  ['pedir', 'presente', 'pido pides pide pedimos pedís piden'],
  ['pedir', 'preterito', 'pedí pediste pidió pedimos pedisteis pidieron'],
  ['pedir', 'subj-presente', 'pida pidas pida pidamos pidáis pidan'],
  ['sentir', 'preterito', 'sentí sentiste sintió sentimos sentisteis sintieron'],
  ['sentir', 'subj-presente', 'sienta sientas sienta sintamos sintáis sientan'],
  ['dormir', 'preterito', 'dormí dormiste durmió dormimos dormisteis durmieron'],
  ['dormir', 'subj-presente', 'duerma duermas duerma durmamos durmáis duerman'],
  ['dormir', 'subj-imperfecto', 'durmiera durmieras durmiera durmiéramos durmierais durmieran'],
  ['seguir', 'presente', 'sigo sigues sigue seguimos seguís siguen'],
  ['seguir', 'subj-presente', 'siga sigas siga sigamos sigáis sigan'],
  ['elegir', 'presente', 'elijo eliges elige elegimos elegís eligen'],
  ['empezar', 'preterito', 'empecé empezaste empezó empezamos empezasteis empezaron'],
  ['empezar', 'subj-presente', 'empiece empieces empiece empecemos empecéis empiecen'],
  ['enviar', 'presente', 'envío envías envía enviamos enviáis envían'],
  ['continuar', 'subj-presente', 'continúe continúes continúe continuemos continuéis continúen'],
  ['prohibir', 'presente', 'prohíbo prohíbes prohíbe prohibimos prohibís prohíben'],

  // Spelling changes
  ['buscar', 'preterito', 'busqué buscaste buscó buscamos buscasteis buscaron'],
  ['llegar', 'subj-presente', 'llegue llegues llegue lleguemos lleguéis lleguen'],
  ['coger', 'presente', 'cojo coges coge cogemos cogéis cogen'],
  ['convencer', 'presente', 'convenzo convences convence convencemos convencéis convencen'],
  ['distinguir', 'presente', 'distingo distingues distingue distinguimos distinguís distinguen'],
  ['leer', 'preterito', 'leí leíste leyó leímos leísteis leyeron'],
  ['creer', 'subj-imperfecto', 'creyera creyeras creyera creyéramos creyerais creyeran'],
  ['construir', 'presente', 'construyo construyes construye construimos construís construyen'],
  ['construir', 'preterito', 'construí construiste construyó construimos construisteis construyeron'],
  ['incluir', 'subj-presente', 'incluya incluyas incluya incluyamos incluyáis incluyan'],

  // -zco and -ducir
  ['conocer', 'presente', 'conozco conoces conoce conocemos conocéis conocen'],
  ['conocer', 'subj-presente', 'conozca conozcas conozca conozcamos conozcáis conozcan'],
  ['traducir', 'preterito', 'traduje tradujiste tradujo tradujimos tradujisteis tradujeron'],
  ['producir', 'subj-imperfecto', 'produjera produjeras produjera produjéramos produjerais produjeran'],

  // Irregulars
  ['ser', 'presente', 'soy eres es somos sois son'],
  ['ser', 'imperfecto', 'era eras era éramos erais eran'],
  ['ser', 'subj-presente', 'sea seas sea seamos seáis sean'],
  ['ser', 'subj-imperfecto', 'fuera fueras fuera fuéramos fuerais fueran'],
  ['ser', 'imperativo', '- sé sea seamos sed sean'],
  ['ir', 'presente', 'voy vas va vamos vais van'],
  ['ir', 'preterito', 'fui fuiste fue fuimos fuisteis fueron'],
  ['ir', 'imperfecto', 'iba ibas iba íbamos ibais iban'],
  ['ir', 'imperativo', '- ve vaya vamos id vayan'],
  ['ir', 'imperativo-negativo', '- no vayas no vaya no vayamos no vayáis no vayan'],
  ['estar', 'presente', 'estoy estás está estamos estáis están'],
  ['estar', 'preterito', 'estuve estuviste estuvo estuvimos estuvisteis estuvieron'],
  ['estar', 'subj-presente', 'esté estés esté estemos estéis estén'],
  ['estar', 'imperativo', '- está esté estemos estad estén'],
  ['haber', 'presente', 'he has ha hemos habéis han'],
  ['haber', 'subj-presente', 'haya hayas haya hayamos hayáis hayan'],
  ['haber', 'preterito', 'hube hubiste hubo hubimos hubisteis hubieron'],
  ['dar', 'presente', 'doy das da damos dais dan'],
  ['dar', 'preterito', 'di diste dio dimos disteis dieron'],
  ['dar', 'subj-imperfecto', 'diera dieras diera diéramos dierais dieran'],
  ['dar', 'imperativo', '- da dé demos dad den'],
  ['ver', 'presente', 'veo ves ve vemos veis ven'],
  ['ver', 'preterito', 'vi viste vio vimos visteis vieron'],
  ['ver', 'imperfecto', 'veía veías veía veíamos veíais veían'],
  ['ver', 'subj-presente', 'vea veas vea veamos veáis vean'],
  ['saber', 'presente', 'sé sabes sabe sabemos sabéis saben'],
  ['saber', 'subj-presente', 'sepa sepas sepa sepamos sepáis sepan'],
  ['saber', 'futuro', 'sabré sabrás sabrá sabremos sabréis sabrán'],
  ['caber', 'presente', 'quepo cabes cabe cabemos cabéis caben'],
  ['caber', 'preterito', 'cupe cupiste cupo cupimos cupisteis cupieron'],
  ['tener', 'presente', 'tengo tienes tiene tenemos tenéis tienen'],
  ['tener', 'preterito', 'tuve tuviste tuvo tuvimos tuvisteis tuvieron'],
  ['tener', 'futuro', 'tendré tendrás tendrá tendremos tendréis tendrán'],
  ['tener', 'subj-presente', 'tenga tengas tenga tengamos tengáis tengan'],
  ['tener', 'imperativo', '- ten tenga tengamos tened tengan'],
  ['venir', 'presente', 'vengo vienes viene venimos venís vienen'],
  ['venir', 'preterito', 'vine viniste vino vinimos vinisteis vinieron'],
  ['decir', 'presente', 'digo dices dice decimos decís dicen'],
  ['decir', 'preterito', 'dije dijiste dijo dijimos dijisteis dijeron'],
  ['decir', 'futuro', 'diré dirás dirá diremos diréis dirán'],
  ['decir', 'imperativo', '- di diga digamos decid digan'],
  ['hacer', 'presente', 'hago haces hace hacemos hacéis hacen'],
  ['hacer', 'preterito', 'hice hiciste hizo hicimos hicisteis hicieron'],
  ['hacer', 'subj-imperfecto', 'hiciera hicieras hiciera hiciéramos hicierais hicieran'],
  ['hacer', 'imperativo', '- haz haga hagamos haced hagan'],
  ['poner', 'preterito', 'puse pusiste puso pusimos pusisteis pusieron'],
  ['poner', 'condicional', 'pondría pondrías pondría pondríamos pondríais pondrían'],
  ['querer', 'preterito', 'quise quisiste quiso quisimos quisisteis quisieron'],
  ['querer', 'futuro', 'querré querrás querrá querremos querréis querrán'],
  ['poder', 'preterito', 'pude pudiste pudo pudimos pudisteis pudieron'],
  ['salir', 'presente', 'salgo sales sale salimos salís salen'],
  ['salir', 'imperativo', '- sal salga salgamos salid salgan'],
  ['traer', 'preterito', 'traje trajiste trajo trajimos trajisteis trajeron'],
  ['caer', 'preterito', 'caí caíste cayó caímos caísteis cayeron'],
  ['oír', 'presente', 'oigo oyes oye oímos oís oyen'],
  ['oír', 'preterito', 'oí oíste oyó oímos oísteis oyeron'],
  ['oír', 'imperativo', '- oye oiga oigamos oíd oigan'],
  ['reír', 'presente', 'río ríes ríe reímos reís ríen'],
  ['reír', 'preterito', 'reí reíste rio reímos reísteis rieron'],

  // Prefixed verbs: stress moves, accents appear
  ['mantener', 'presente', 'mantengo mantienes mantiene mantenemos mantenéis mantienen'],
  ['mantener', 'imperativo', '- mantén mantenga mantengamos mantened mantengan'],
  ['componer', 'imperativo', '- compón componga compongamos componed compongan'],
  ['deshacer', 'imperativo', '- deshaz deshaga deshagamos deshaced deshagan'],
  ['prever', 'presente', 'preveo prevés prevé prevemos prevéis prevén'],
  ['prever', 'preterito', 'preví previste previó previmos previsteis previeron'],
  ['sonreír', 'presente', 'sonrío sonríes sonríe sonreímos sonreís sonríen'],
  ['sonreír', 'preterito', 'sonreí sonreíste sonrió sonreímos sonreísteis sonrieron'],
  ['contradecir', 'imperativo', '- contradice contradiga contradigamos contradecid contradigan'],
  ['devolver', 'perfecto', 'he devuelto has devuelto ha devuelto hemos devuelto habéis devuelto han devuelto'],

  // Reflexive
  ['levantar', 'presente', 'me levanto te levantas se levanta nos levantamos os levantáis se levantan', true],
  ['levantar', 'perfecto', 'me he levantado te has levantado se ha levantado nos hemos levantado os habéis levantado se han levantado', true],
  ['levantar', 'imperativo', '- levántate levántese levantémonos levantaos levántense', true],
  ['sentar', 'imperativo-negativo', '- no te sientes no se siente no nos sentemos no os sentéis no se sienten', true],
  ['divertir', 'imperativo', '- diviértete diviértase divirtámonos divertíos diviértanse', true],
  ['poner', 'imperativo', '- ponte póngase pongámonos poneos pónganse', true],
]

/** [verb, gerund, participle] */
const NON_FINITE: [string, string, string][] = [
  ['hablar', 'hablando', 'hablado'],
  ['comer', 'comiendo', 'comido'],
  ['leer', 'leyendo', 'leído'],
  ['construir', 'construyendo', 'construido'],
  ['oír', 'oyendo', 'oído'],
  ['traer', 'trayendo', 'traído'],
  ['ir', 'yendo', 'ido'],
  ['pedir', 'pidiendo', 'pedido'],
  ['dormir', 'durmiendo', 'dormido'],
  ['decir', 'diciendo', 'dicho'],
  ['venir', 'viniendo', 'venido'],
  ['poder', 'pudiendo', 'podido'],
  ['reír', 'riendo', 'reído'],
  ['seguir', 'siguiendo', 'seguido'],
  ['escribir', 'escribiendo', 'escrito'],
  ['romper', 'rompiendo', 'roto'],
  ['componer', 'componiendo', 'compuesto'],
  ['prever', 'previendo', 'previsto'],
]

let failures = 0
const fail = (msg: string) => {
  failures++
  console.log(`  \x1b[31mx\x1b[0m ${msg}`)
}

for (const [verb, tense, want, refl] of CASES) {
  let got: string
  try {
    got = c.table(verb, tense, { refl }).map((cell) => cell[0] ?? '-').join(' ')
  } catch (e) {
    fail(`${verb} ${tense}: threw ${(e as Error).message}`)
    continue
  }
  if (got !== want) fail(`${verb} ${tense}${refl ? ' (refl)' : ''}\n      want ${want}\n      got  ${got}`)
}

for (const [verb, ger, part] of NON_FINITE) {
  if (c.gerund(verb) !== ger) fail(`${verb} gerund: want ${ger}, got ${c.gerund(verb)}`)
  if (c.participle(verb) !== part) fail(`${verb} participle: want ${part}, got ${c.participle(verb)}`)
}

// Accepted alternatives
const has = (verb: string, tense: TenseId, p: 0 | 1 | 2 | 3 | 4 | 5, form: string) => {
  if (!c.conjugate(verb, tense, p).includes(form)) fail(`${verb} ${tense} ${p} should accept "${form}"`)
}
has('hablar', 'subj-imperfecto', 3, 'hablásemos')
has('tener', 'subj-imperfecto', 0, 'tuviese')
has('ir', 'imperativo', 3, 'vayamos')
has('saber', 'subj-pluscuamperfecto', 2, 'hubiese sabido')

/* ---- answer checking ---------------------------------------------------- */

const checker = createChecker(specs)

/** [verb, tense, person, typed answer, expected verdict or diagnosis kind, reflexive?] */
type CheckCase = [string, TenseId, Person, string, 'correct' | 'accent' | Diagnosis['kind'], boolean?]

const CHECKS: CheckCase[] = [
  ['hablar', 'preterito', 2, 'habló', 'correct'],
  ['hablar', 'preterito', 2, '  Él HABLÓ. ', 'correct'],
  ['tener', 'subj-imperfecto', 0, 'tuviese', 'correct'],
  ['ir', 'imperativo', 3, 'vayamos', 'correct'],
  ['estar', 'presente', 4, 'estais', 'accent'],
  ['conocer', 'subj-imperfecto', 3, 'conocieramos', 'accent'],
  ['enviar', 'presente', 0, 'envio', 'accent'],
  // The accent is the difference between two forms: marked wrong.
  ['hablar', 'preterito', 2, 'hablo', 'accent-meaning'],
  ['hablar', 'preterito', 0, 'hable', 'accent-meaning'],
  ['hablar', 'presente', 0, 'habló', 'accent-meaning'],
  ['hablar', 'subj-presente', 0, 'hablé', 'accent-meaning'],
  ['tener', 'preterito', 0, 'tuvo', 'person'],
  ['ser', 'imperfecto', 3, 'eramos', 'accent'],
  ['tener', 'preterito', 0, 'tenía', 'tense'],
  ['hablar', 'subj-imperfecto', 0, 'hablaba', 'tense'],
  ['hacer', 'perfecto', 1, 'habías hecho', 'tense'],
  ['levantar', 'presente', 0, 'levanto', 'pronoun', true],
  ['levantar', 'imperativo', 1, 'levanta', 'pronoun', true],
  ['buscar', 'preterito', 0, 'buscé', 'spelling'],
  ['coger', 'presente', 0, 'cogo', 'spelling'],
  ['leer', 'preterito', 2, 'leió', 'spelling'],
  ['pensar', 'presente', 0, 'penso', 'stem'],
  ['sentir', 'preterito', 2, 'sentió', 'stem'],
  ['dormir', 'subj-presente', 3, 'dormamos', 'stem'],
  ['mantener', 'presente', 1, 'mantenes', 'stem'],
  ['tener', 'preterito', 0, 'tení', 'regularized'],
  ['decir', 'futuro', 0, 'deciré', 'regularized'],
  ['abrir', 'perfecto', 0, 'he abrido', 'regularized'],
  ['poner', 'presente', 0, 'poneo', 'unknown'],
  ['hablar', 'presente', 0, '', 'unknown'],
]

for (const [inf, tense, person, typed, want, refl] of CHECKS) {
  const v = checker.check({ inf, tense, person, refl }, typed)
  const got = v.result === 'wrong' ? v.diagnosis.kind : v.result
  if (got !== want) fail(`check ${inf} ${tense} ${person} "${typed}": want ${want}, got ${got} (expected form ${v.expected})`)
}

if (normalize('¿Yo  HABLO?') !== 'hablo') fail(`normalize: got "${normalize('¿Yo  HABLO?')}"`)

const DIFFS: [string, string, string][] = [
  ['pensa', 'piensa', 'e → ie'],
  ['sentió', 'sintió', 'e → i'],
  ['jugo', 'juego', 'u → ue'],
  ['dormamos', 'durmamos', 'o → u'],
]
for (const [a, b, want] of DIFFS) {
  const got = difference(a, b).join(' → ')
  if (got !== want) fail(`difference ${a} / ${b}: want ${want}, got ${got}`)
}
const stemText = explain({ kind: 'stem', change: 'e>ie' }, { inf: 'sentir', tense: 'preterito', person: 2 }, 'sentió', 'sintió').text
if (!stemText.includes('e → i.')) fail(`explain stem: ${stemText}`)

/* ---- identification ------------------------------------------------------ */

const id = (form: string, inf: string, guess: [string, TenseId, Person], want: boolean) => {
  const r = checker.checkIdentify({ inf, tense: guess[1], person: guess[2] }, form, { inf: guess[0], tense: guess[1], person: guess[2] })
  if (r.correct !== want) fail(`identify "${form}" as ${guess.join(' ')}: want ${want}, got ${r.correct}`)
}
id('hablamos', 'hablar', ['hablar', 'presente', 3], true)
id('hablamos', 'hablar', ['hablar', 'preterito', 3], true)
id('hable', 'hablar', ['hablar', 'subj-presente', 0], true)
id('hable', 'hablar', ['hablar', 'subj-presente', 2], true)
id('hable', 'hablar', ['hablar', 'subj-presente', 1], false)
id('hubiera dicho', 'decir', ['decir', 'subj-pluscuamperfecto', 0], true)
id('hubiera dicho', 'decir', ['decir', 'pluscuamperfecto', 0], false)
id('fue', 'ir', ['ser', 'preterito', 2], false)
{
  const r = checker.checkIdentify({ inf: 'levantar', tense: 'preterito', person: 0, refl: true }, 'me levanté', { inf: 'Levantarse', tense: 'preterito', person: 0 })
  if (!r.correct) fail('identify should accept "levantarse" for a pronominal verb')
}

/* ---- regularity ------------------------------------------------------- */

const REGULARITY: [string, TenseId, string][] = [
  ['hablar', 'presente', 'regular'],
  ['buscar', 'preterito', 'spelling'],
  ['construir', 'presente', 'spelling'],
  ['pensar', 'presente', 'stem'],
  ['enviar', 'presente', 'stem'],
  ['pedir', 'preterito', 'stem'],
  ['tener', 'presente', 'irregular'],
  ['tener', 'imperfecto', 'regular'],
  ['conocer', 'presente', 'irregular'],
  ['conocer', 'preterito', 'regular'],
  ['hacer', 'perfecto', 'irregular'],
  ['mantener', 'preterito', 'irregular'],
]
for (const [inf, tense, want] of REGULARITY) {
  const got = checker.regularity(inf, tense)
  if (got !== want) fail(`regularity ${inf} ${tense}: want ${want}, got ${got}`)
}
if (checker.check({ inf: 'conocer', tense: 'presente', person: 0 }, 'conoco').result !== 'wrong') fail('conoco should be wrong')

const total = REGULARITY.length + 1 + CASES.length + NON_FINITE.length * 2 + 4 + CHECKS.length + 1 + DIFFS.length + 1 + 9
if (failures) {
  console.log(`\n\x1b[31m${failures} of ${total} engine checks failed\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m${total} engine checks passed\x1b[0m`)
