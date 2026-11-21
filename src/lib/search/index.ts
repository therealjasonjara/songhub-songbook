export { buildIndex, loadIndex, serializeIndex, fuzzyEdits, ARTIST_FIELD_BOOST } from './build';
export { searchSongs, songsByArtist, RESULT_LIMIT } from './songs';
export { suggestArtists, withinOneEdit, SUGGESTION_LIMIT } from './artists';
export type { ArtistRef, ArtistSuggestion, SearchIndex, SongHit, SongSearchResult } from './types';
export { normalize } from '../normalize';
