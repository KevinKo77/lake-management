/**
 * Writes the SYNTHETIC demonstration fixture of LANOVA Player Intelligence V1:
 *   lanova/cases/player-intelligence/demo-data/demo-league-full.txt   (Football.TXT "full" format)
 *   lanova/cases/player-intelligence/demo-data/demo-registry.json     (identity registry)
 * Every club, player and match is FICTIONAL. Real 2025/26 data are withheld until their reuse rights are established
 * (see lanova/player-intelligence/SOURCE-RIGHTS.md). The fixture deliberately contains the hard identity cases:
 * accents and letter case, homonyms at two clubs, an ambiguous name, a mid-season transfer, an undocumented player,
 * an inconsistent scorer, dismissals and added-time minutes. Deterministic: no randomness, no clock.
 * The publication gate (lanova/player-intelligence/policy.js) imports DEMO_FIXTURE and regenerates it: a file is treated as
 * this fictional fixture only if its bytes equal what this generator produces, never because a label says so.
 * Usage (repo root): node scripts/player-intelligence/make_demo_fixture.mjs [--check]
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const DIR = 'lanova/cases/player-intelligence/demo-data', SEASON = '2025/26';
const SRC = n => ({name: n, source: 'synthetic demo listing (fictional)'});
const CLUBS = [
  {id: 'demo-altamar', names: [SRC('Altamar CF'), SRC('Altamar Club de Fútbol')]},
  {id: 'demo-brisa-norte', names: [SRC('Brisa Norte FC')]},
  {id: 'demo-cerro-azul', names: [SRC('Cerro Azul SD')]},
  {id: 'demo-dunas', names: [SRC('Dunas CD')]},
];
// [id, display name, source position, effective position, aliases, clubs (2025/26)]
const P = [
  ['SYN-A01', 'Óscar Tremalde', 'GK', 'GK', ['Óscar Tremalde'], ['demo-altamar']],
  ['SYN-A02', 'Teo Quorvaz', 'DF', 'DF', ['Teo Quorvaz'], ['demo-altamar']],
  ['SYN-A03', 'Íñigo Zarbaleta', 'DF', 'DF', ['Íñigo Zarbaleta'], ['demo-altamar']],
  ['SYN-A04', 'Bruno Calvente', 'DF', 'DF', ['Bruno Calvente'], ['demo-altamar']],
  ['SYN-A05', 'Luis Prandel', 'DF', 'DF', ['Luis Prandel'], ['demo-altamar']],
  ['SYN-A06', 'Ander Vescoli', 'MF', 'MF', ['Ander Vescoli'], ['demo-altamar']],
  ['SYN-A07', 'Mateo Rusquel', 'MF', 'MF', ['Mateo Rusquel'], ['demo-altamar']],
  ['SYN-A08', 'Pau Ledrova', 'MF', 'MF', ['Pau Ledrova'], ['demo-altamar']],
  ['SYN-A09', 'Hugo Tarvessa', 'MF', 'FW', ['Hugo Tarvessa'], ['demo-altamar']],   // source MF, corroborated FW (effectivePosition convention)
  ['SYN-A10', 'Nil Escovar', 'FW', 'FW', ['Nil Escovar'], ['demo-altamar']],
  ['SYN-A11', 'Dario Montefal', 'FW', 'FW', ['Dario Montefal'], ['demo-altamar']],
  ['SYN-A12', 'Gael Sorbano', 'MF', 'MF', ['Gael Sorbano'], ['demo-altamar']],
  ['SYN-T01', 'Raúl Veskeda', 'MF', 'MF', ['Raúl Veskeda'], ['demo-altamar', 'demo-dunas']],   // mid-season transfer
  ['SYN-B01', 'Iván Corbadel', 'GK', 'GK', ['Iván Corbadel'], ['demo-brisa-norte']],
  ['SYN-B02', 'Sergi Albarón', 'DF', 'DF', ['Sergi Albarón'], ['demo-brisa-norte']],
  ['SYN-B03', 'Unai Pertxel', 'DF', 'DF', ['Unai Pertxel'], ['demo-brisa-norte']],
  ['SYN-B04', 'Kevin Dalmuro', 'DF', 'DF', ['Kevin Dalmuro'], ['demo-brisa-norte']],
  ['SYN-B05', 'Adrià Folquet', 'DF', 'DF', ['Adrià Folquet'], ['demo-brisa-norte']],
  ['SYN-B06', 'Jon Ibarzola', 'MF', 'MF', ['Jon Ibarzola'], ['demo-brisa-norte']],
  ['SYN-B07', 'Marco Belvane', 'MF', 'MF', ['Marco Belvane'], ['demo-brisa-norte']],
  ['SYN-B08', 'Marco Belvane Ruiz', 'MF', 'MF', ['Marco Belvane Ruiz', 'Marco Belvane'], ['demo-brisa-norte']],   // same short name: ambiguous
  ['SYN-B09', 'Álex Tormesa', 'MF', 'MF', ['Álex Tormesa'], ['demo-brisa-norte']],
  ['SYN-B10', 'Rubén Calvisto', 'FW', 'FW', ['Rubén Calvisto'], ['demo-brisa-norte']],
  ['SYN-B11', 'Yeray Montuno', 'FW', 'FW', ['Yeray Montuno'], ['demo-brisa-norte']],
  ['SYN-B12', 'Lucas Ferbano', 'DF', 'DF', ['Lucas Ferbano'], ['demo-brisa-norte']],
  ['SYN-C01', 'Pablo Ordenix', 'GK', 'GK', ['Pablo Ordenix'], ['demo-cerro-azul']],
  ['SYN-C02', 'Javi Torrelda', 'DF', 'DF', ['Javi Torrelda'], ['demo-cerro-azul']],
  ['SYN-C03', 'Martín Baselga', 'DF', 'DF', ['Martín Baselga'], ['demo-cerro-azul']],
  ['SYN-C04', 'Eric Valdomar', 'DF', 'DF', ['Eric Valdomar'], ['demo-cerro-azul']],
  ['SYN-C05', 'Luis Prandel', 'DF', 'DF', ['Luis Prandel'], ['demo-cerro-azul']],   // homonym of SYN-A05 at another club
  ['SYN-C06', 'Diego Sarvinet', 'MF', 'MF', ['Diego Sarvinet'], ['demo-cerro-azul']],
  ['SYN-C07', 'Óliver Pradanta', 'MF', 'MF', ['Óliver Pradanta'], ['demo-cerro-azul']],
  ['SYN-C08', 'Samu Trescol', 'MF', 'MF', ['Samu Trescol'], ['demo-cerro-azul']],
  ['SYN-C09', 'Fran Galdeira', 'MF', 'MF', ['Fran Galdeira'], ['demo-cerro-azul']],
  ['SYN-C10', 'Borja Quintaval', 'FW', 'FW', ['Borja Quintaval'], ['demo-cerro-azul']],
  ['SYN-C11', 'Aitor Lembrana', 'FW', 'FW', ['Aitor Lembrana'], ['demo-cerro-azul']],
  ['SYN-C12', 'Rafa Celvino', 'MF', null, ['Rafa Celvino'], ['demo-cerro-azul']],   // no documented position
  ['SYN-D01', 'Álvaro Pentrix', 'GK', 'GK', ['Álvaro Pentrix'], ['demo-dunas']],
  ['SYN-D02', 'Joel Marbenta', 'DF', 'DF', ['Joel Marbenta'], ['demo-dunas']],
  ['SYN-D03', 'Carlos Ovenda', 'DF', 'DF', ['Carlos Ovenda'], ['demo-dunas']],
  ['SYN-D04', 'Toni Brescal', 'DF', 'DF', ['Toni Brescal'], ['demo-dunas']],
  ['SYN-D05', 'Izan Folgueral', 'DF', 'DF', ['Izan Folgueral'], ['demo-dunas']],
  ['SYN-D06', 'Mario Ventuel', 'MF', 'MF', ['Mario Ventuel'], ['demo-dunas']],
  ['SYN-D07', 'Ángel Corvisa', 'MF', 'MF', ['Ángel Corvisa'], ['demo-dunas']],
  ['SYN-D08', 'Dani Pelvoret', 'MF', 'MF', ['Dani Pelvoret'], ['demo-dunas']],
  ['SYN-D09', 'Enzo Morlaga', 'FW', 'FW', ['Enzo Morlaga'], ['demo-dunas']],
  ['SYN-D10', 'Víctor Abaneda', 'FW', 'FW', ['Víctor Abaneda'], ['demo-dunas']],
  ['SYN-D11', 'Rober Calmesta', 'DF', 'DF', ['Rober Calmesta'], ['demo-dunas']],
];
const registry = {schema: 'lanova-player-registry-v1', synthetic: true, notice: 'FICTIONAL demonstration registry: no real player or club.', season: SEASON, clubs: CLUBS,
  players: P.map(([id, displayName, sp, ep, aliases, clubs]) => ({id, displayName, sourcePosition: sp, effectivePosition: ep, externalIds: {}, aliases: aliases.map(SRC),
    affiliations: clubs.map(club => ({club, season: SEASON, source: 'synthetic demo squad listing (fictional)'}))}))};

// Football.TXT "full" format. Names are written the way that source writes them (surnames sometimes in capitals, accents sometimes dropped).
const txt = `= Synthetic Demo League 2025/26 (FICTIONAL — LANOVA demonstration data)

# Dates    Sat Aug 16 2025 - Sun Aug 31 2025
# Teams    4
# Matches  6


▪ Matchday 1
Sat Aug 16 18:00 UTC+2 @ Estadio Demo Altamar, Altamar, Att: 9000
  Altamar CF v Brisa Norte FC  2-1 (1-0)
     (Nil ESCOVAR 23', 77'(p);
      Rubén Calvisto 64')

Altamar CF: Óscar Tremalde - Teo QUORVAZ, Inigo ZARBALETA, Bruno Calvente, Luis Prandel -
      Ander Vescoli (70' Gael Sorbano), Mateo Rusquel, Raúl Veskeda - Hugo Tarvessa,
      Nil ESCOVAR [c] (85' Dario Montefal), Pau Ledrova
    Yellow: Mateo Rusquel 33'

Brisa Norte FC: Iván Corbadel - Sergi Albarón, Unai Pertxel, Kevin Dalmuro (46' Lucas Ferbano), Adrià Folquet -
      Jon Ibarzola, Marco Belvane, Álex Tormesa - Rubén Calvisto [c], Yeray Montuno (90+2' Marco Belvane Ruiz),
      Kilian Drumvel
    Yellow: Unai Pertxel 12'
    Yellow-Red: Unai Pertxel 60'

Refs: Demo Referee One


Sun Aug 17 20:00 UTC+2 @ Estadio Demo Cerro, Cerro Azul, Att: 7000
  Cerro Azul SD v Dunas CD  0-0 (0-0)

Cerro Azul SD: Pablo Ordenix - Javi Torrelda, Martín Baselga, Eric Valdomar, Luis Prandel -
      Diego Sarvinet, Óliver Pradanta (45+1' Rafa Celvino), Samu Trescol, Fran Galdeira -
      Borja Quintaval [c], Aitor Lembrana

Dunas CD: Álvaro Pentrix - Joel Marbenta, Carlos Ovenda, Toni Brescal, Izan Folgueral -
      Mario Ventuel, Ángel Corvisa, Dani Pelvoret - Enzo Morlaga [c], Víctor Abaneda,
      Luis Prandel (80' Rober Calmesta)
    Red: Toni Brescal 75'

Refs: Demo Referee Two


▪ Matchday 2
Sat Aug 23 18:00 UTC+2 @ Estadio Demo Brisa, Brisa Norte, Att: 6000
  Brisa Norte FC v Cerro Azul SD  1-1 (0-1)
     (Kilian Drumvel 88';
      Borja QUINTAVAL 30')

Brisa Norte FC: Iván Corbadel - Sergi Albarón, Lucas Ferbano, Kevin Dalmuro, Adrià Folquet -
      Jon Ibarzola, Marco Belvane Ruiz, Álex Tormesa (60' Marco Belvane) - Rubén Calvisto [c],
      Yeray Montuno, Unai Pertxel
    Yellow: Álex Tormesa 41'

Cerro Azul SD: Pablo Ordenix - Javi Torrelda, Martín Baselga, Eric Valdomar, Luis Prandel -
      Diego Sarvinet, Óliver Pradanta, Samu Trescol, Fran Galdeira -
      Borja Quintaval [c] (82' Rafa Celvino), Aitor Lembrana (70' Fran Galdeira)
    Yellow: Luis Prandel 55', Samu Trescol 90+3'

Refs: Demo Referee Three


Sun Aug 24 20:00 UTC+2 @ Estadio Demo Dunas, Dunas, Att: 5000
  Dunas CD v Altamar CF  1-3 (1-1)
     (Enzo Morlaga 12';
      Nil ESCOVAR 40', Dario Montefal 70', Toni Brescal 88'(og))

Dunas CD: Álvaro Pentrix - Joel Marbenta, Carlos Ovenda, Toni Brescal, Izan Folgueral -
      Mario Ventuel, Ángel Corvisa, Dani Pelvoret (55' Rober Calmesta) - Enzo Morlaga [c],
      Víctor Abaneda, Izan FOLGUERAL
    Yellow: Ángel Corvisa 50'

Altamar CF: Óscar Tremalde - Teo Quorvaz, Íñigo Zarbaleta, Bruno Calvente, Luis Prandel -
      Ander Vescoli, Mateo Rusquel (75' Gael Sorbano), Pau Ledrova - Hugo Tarvessa (60' Dario Montefal),
      Nil ESCOVAR [c], Raúl Veskeda

Refs: Demo Referee One


▪ Matchday 3
Sat Aug 30 18:00 UTC+2 @ Estadio Demo Altamar, Altamar, Att: 9500
  Altamar CF v Cerro Azul SD  1-0 (0-0)
     (Dario MONTEFAL 66')

Altamar CF: Óscar Tremalde - Teo Quorvaz, Íñigo Zarbaleta, Bruno Calvente, Luis Prandel -
      Ander Vescoli, Mateo Rusquel, Pau Ledrova, Gael Sorbano - Nil ESCOVAR [c], Hugo Tarvessa (58' Dario Montefal)
    Red: Bruno Calvente 80'

Cerro Azul SD: Pablo Ordenix - Javi Torrelda, Martín Baselga, Eric Valdomar, Luis Prandel -
      Diego Sarvinet, Óliver Pradanta, Samu Trescol, Rafa Celvino -
      Borja Quintaval [c], Aitor Lembrana

Refs: Demo Referee Two


Sun Aug 31 20:00 UTC+2 @ Estadio Demo Dunas, Dunas, Att: 5200
  Dunas CD v Brisa Norte FC  2-0 (1-0)
     (Raúl Veskeda 30', Víctor Abaneda 89')

Dunas CD: Álvaro Pentrix - Joel Marbenta, Carlos Ovenda, Toni Brescal, Izan Folgueral -
      Mario Ventuel, Ángel Corvisa, Raúl Veskeda - Enzo Morlaga [c], Víctor Abaneda (90+1' Rober Calmesta),
      Dani Pelvoret
    Yellow: Raúl Veskeda 44'

Brisa Norte FC: Iván Corbadel - Sergi Albarón, Unai Pertxel, Kevin Dalmuro, Adrià Folquet -
      Jon Ibarzola, Marco Belvane Ruiz, Álex Tormesa - Rubén Calvisto [c], Yeray Montuno,
      Lucas Ferbano

Refs: Demo Referee Three
`;
// Note: matchday 2 Brisa Norte–Cerro Azul credits a goal to Kilian Drumvel, who is not in that line-up (inconsistent
// scorer on purpose). Matchday 2 Altamar–Dunas lists "Izan FOLGUERAL" twice for Dunas (two starters with the same name): an inconsistent
// record on purpose; matchday 2 Cerro Azul lists Fran Galdeira twice (as starter and substitute): also inconsistent.

const manifest = {synthetic: true, description: 'LANOVA synthetic demonstration league (fictional clubs and players), written by scripts/player-intelligence/make_demo_fixture.mjs',
  url: null, revision: 'generated by make_demo_fixture.mjs (deterministic)', licence: 'LANOVA demonstration fixture — fictional; no real player, club or match',
  rightsDecision: 'NOT-APPLICABLE (synthetic)', note: 'Informational only. Publication is decided by lanova/player-intelligence/publication-policy.json and the publication gate, never by these fields.', sha256: createHash('sha256').update(txt).digest('hex')};
export const DEMO_FIXTURE = {[`${DIR}/demo-league-full.txt`]: txt, [`${DIR}/demo-registry.json`]: JSON.stringify(registry, null, 1) + '\n', [`${DIR}/demo-manifest.json`]: JSON.stringify(manifest, null, 1) + '\n'};
const files = DEMO_FIXTURE;
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1]);
if (isMain && process.argv[2] === '--check') {
  const diff = Object.entries(files).filter(([f, t]) => !existsSync(f) || readFileSync(f, 'utf8') !== t).map(([f]) => f);
  console.log(diff.length ? `differs: ${diff.join(', ')}` : 'demo fixture reproduced exactly'); process.exit(diff.length ? 1 : 0);
}
if (isMain && process.argv[2] !== '--check') {
  mkdirSync(DIR, {recursive: true});
  for (const [f, t] of Object.entries(files)) writeFileSync(f, t);
  console.log('wrote', Object.keys(files).join(', '));
}
