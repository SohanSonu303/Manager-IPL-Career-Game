/**
 * Ten franchises based on the real league's teams, with one word of each name changed
 * (e.g. Sunrisers Hyderabad -> Sunrisers Falcons). Colors and crests are our own; no real
 * logos. Crests are assigned by the generator.
 */
import type { CrestGlyph, Team } from '../../src/data/types.ts'

/** `glyph` is chosen to fit the name; the crest shape is seeded by the generator. */
export const sourceTeams: (Omit<Team, 'crest'> & { glyph: CrestGlyph })[] = [
  {
    id: 'hyd',
    glyph: 'wing',
    city: 'Hyderabad',
    name: 'Sunrisers Falcons',
    short: 'SRF',
    colors: { primary: '#d0793f', secondary: '#12404a' },
    ground: 'Deccan Park',
  },
  {
    id: 'che',
    glyph: 'star',
    city: 'Chennai',
    name: 'Chennai Super Lions',
    short: 'CSL',
    colors: { primary: '#e8c26a', secondary: '#3d3a8f' },
    ground: 'Marina Ground',
  },
  {
    id: 'mum',
    glyph: 'wave',
    city: 'Mumbai',
    name: 'Mumbai Mariners',
    short: 'MUM',
    colors: { primary: '#0f4c8a', secondary: '#d9b77e' },
    ground: 'Harbour Stadium',
  },
  {
    id: 'blr',
    glyph: 'bolt',
    city: 'Bengaluru',
    name: 'Royal Strikers Bengaluru',
    short: 'RSB',
    colors: { primary: '#1f1f23', secondary: '#e0453a' },
    ground: 'Garden City Oval',
  },
  {
    id: 'kol',
    glyph: 'flame',
    city: 'Kolkata',
    name: 'Kolkata Knight Warriors',
    short: 'KKW',
    colors: { primary: '#4b2a7a', secondary: '#e8c26a' },
    ground: 'Hooghly Park',
  },
  {
    id: 'del',
    glyph: 'star',
    city: 'Delhi',
    name: 'Delhi Commanders',
    short: 'DLC',
    colors: { primary: '#1f3f8f', secondary: '#ef6461' },
    ground: 'Yamuna Ground',
  },
  {
    id: 'pun',
    glyph: 'peak',
    city: 'Mohali',
    name: 'Punjab Panthers',
    short: 'PBP',
    colors: { primary: '#b3262e', secondary: '#c9ccd6' },
    ground: 'Five Rivers Stadium',
  },
  {
    id: 'raj',
    glyph: 'sun',
    city: 'Jaipur',
    name: 'Rajasthan Rangers',
    short: 'RJR',
    colors: { primary: '#d6408f', secondary: '#1f3f8f' },
    ground: 'Pink City Park',
  },
  {
    id: 'luc',
    glyph: 'leaf',
    city: 'Lucknow',
    name: 'Lucknow Super Nawabs',
    short: 'LSN',
    colors: { primary: '#0f7c80', secondary: '#ff7f6b' },
    ground: 'Gomti Oval',
  },
  {
    id: 'guj',
    glyph: 'bolt',
    city: 'Ahmedabad',
    name: 'Gujarat Thunder',
    short: 'GJT',
    colors: { primary: '#1b2a4a', secondary: '#7fd1ae' },
    ground: 'Sabarmati Arena',
  },
]
