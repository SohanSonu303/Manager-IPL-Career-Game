/**
 * Ten fictional franchises (placeholder names; see "Open decisions" in TODO.md).
 * Cities without a real franchise, original nicknames, and color pairs chosen to
 * avoid the real league's team palettes. Crests are assigned by the generator.
 */
import type { Team } from '../../src/data/types.ts'

export const sourceTeams: Omit<Team, 'crest'>[] = [
  {
    id: 'pun',
    city: 'Pune',
    nickname: 'Monsoons',
    short: 'PNM',
    colors: { primary: '#2e7d4f', secondary: '#f2e6c9' },
    ground: 'Riverside Oval',
  },
  {
    id: 'ind',
    city: 'Indore',
    nickname: 'Falcons',
    short: 'INF',
    colors: { primary: '#7a1f3d', secondary: '#d9b77e' },
    ground: 'Malwa Park',
  },
  {
    id: 'koc',
    city: 'Kochi',
    nickname: 'Mariners',
    short: 'KCM',
    colors: { primary: '#0f7c80', secondary: '#ff7f6b' },
    ground: 'Harbour Ground',
  },
  {
    id: 'nag',
    city: 'Nagpur',
    nickname: 'Blaze',
    short: 'NGB',
    colors: { primary: '#2b2d31', secondary: '#b5e61d' },
    ground: 'Central Arena',
  },
  {
    id: 'viz',
    city: 'Vizag',
    nickname: 'Waves',
    short: 'VZW',
    colors: { primary: '#3d3a8f', secondary: '#3fc1c9' },
    ground: 'Beach Road Stadium',
  },
  {
    id: 'guw',
    city: 'Guwahati',
    nickname: 'Rhinos',
    short: 'GWR',
    colors: { primary: '#4a5866', secondary: '#7fd1ae' },
    ground: 'Brahmaputra Park',
  },
  {
    id: 'ran',
    city: 'Ranchi',
    nickname: 'Thunder',
    short: 'RNT',
    colors: { primary: '#6b4226', secondary: '#e8c26a' },
    ground: 'Plateau Ground',
  },
  {
    id: 'dha',
    city: 'Dharamshala',
    nickname: 'Peaks',
    short: 'DHP',
    colors: { primary: '#3a3f47', secondary: '#9cc9e8' },
    ground: 'Snowline Oval',
  },
  {
    id: 'cut',
    city: 'Cuttack',
    nickname: 'Comets',
    short: 'CTC',
    colors: { primary: '#5d6b22', secondary: '#f4f1e8' },
    ground: 'Mahanadi Ground',
  },
  {
    id: 'rai',
    city: 'Raipur',
    nickname: 'Stallions',
    short: 'RPS',
    colors: { primary: '#12404a', secondary: '#d0793f' },
    ground: 'Stallion Park',
  },
]
