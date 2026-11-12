/**
 * ChessInReact - Composite Multiplayer Arena Layouts Catalog (Spec 14 § 4, RF-14-01)
 *
 * Provides geometries and spawn coordinates for 18 massive arena configurations (3 to 12 players).
 */

import { IArenaLayoutDefinition, ArenaModeId } from './interfaces/IArenaContracts';

const FACTION_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Lime', hex: '#84CC16' },
  { name: 'Amber', hex: '#F59E0B' },
];

function buildRadialSpawn(
  factionIndex: number,
  totalFactions: number,
  radius: number = 8
) {
  const angle = (2 * Math.PI * factionIndex) / totalFactions;
  const cx = Math.round(Math.cos(angle) * radius);
  const cy = Math.round(Math.sin(angle) * radius);
  const color = FACTION_COLORS[factionIndex % FACTION_COLORS.length];

  return {
    factionId: `FACTION_${factionIndex + 1}`,
    factionIndex,
    colorName: color.name,
    hexColor: color.hex,
    spawnAreaDescription: `Ala Perimetral ${factionIndex + 1} (${color.name})`,
    initialCoordinates: [
      { pieceVariantId: 'KING', coordKey: `${cx},${cy}`, isRoyal: true },
      { pieceVariantId: 'QUEEN', coordKey: `${cx + 1},${cy}` },
      { pieceVariantId: 'ROOK', coordKey: `${cx - 1},${cy}` },
      { pieceVariantId: 'PAWN', coordKey: `${cx},${cy + (cy >= 0 ? -1 : 1)}` },
    ],
  };
}

export const ARENA_LAYOUTS: readonly IArenaLayoutDefinition[] = [
  {
    id: 'THREE_PLAYER_CHESS',
    name: 'Three-Player Hexagonal Arena',
    totalParticipants: 3,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST'],
    factions: Array.from({ length: 3 }, (_, i) => buildRadialSpawn(i, 3, 6)),
  },
  {
    id: 'TRIANGULAR_CHAOS_3P',
    name: 'Triangular Chaos (3P)',
    totalParticipants: 3,
    boardType: 'TRIANGULAR',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 3 }, (_, i) => buildRadialSpawn(i, 3, 5)),
  },
  {
    id: 'FOUR_PLAYER_FFA',
    name: 'Four-Player Cross FFA (160 Casas)',
    totalParticipants: 4,
    boardType: 'SQUARE_CROSS',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST', 'ZOMBIE_BOT'],
    factions: [
      {
        factionId: 'FACTION_1',
        factionIndex: 0,
        colorName: 'Red',
        hexColor: '#EF4444',
        spawnAreaDescription: 'Ala Sul (Red)',
        initialCoordinates: [
          { pieceVariantId: 'KING', coordKey: '7,0', isRoyal: true },
          { pieceVariantId: 'QUEEN', coordKey: '6,0' },
          { pieceVariantId: 'ROOK', coordKey: '3,0' },
          { pieceVariantId: 'PAWN', coordKey: '7,1' },
        ],
      },
      {
        factionId: 'FACTION_2',
        factionIndex: 1,
        colorName: 'Blue',
        hexColor: '#3B82F6',
        spawnAreaDescription: 'Ala Oeste (Blue)',
        initialCoordinates: [
          { pieceVariantId: 'KING', coordKey: '0,7', isRoyal: true },
          { pieceVariantId: 'QUEEN', coordKey: '0,6' },
          { pieceVariantId: 'ROOK', coordKey: '0,3' },
          { pieceVariantId: 'PAWN', coordKey: '1,7' },
        ],
      },
      {
        factionId: 'FACTION_3',
        factionIndex: 2,
        colorName: 'Yellow',
        hexColor: '#EAB308',
        spawnAreaDescription: 'Ala Norte (Yellow)',
        initialCoordinates: [
          { pieceVariantId: 'KING', coordKey: '6,13', isRoyal: true },
          { pieceVariantId: 'QUEEN', coordKey: '7,13' },
          { pieceVariantId: 'ROOK', coordKey: '10,13' },
          { pieceVariantId: 'PAWN', coordKey: '6,12' },
        ],
      },
      {
        factionId: 'FACTION_4',
        factionIndex: 3,
        colorName: 'Green',
        hexColor: '#22C55E',
        spawnAreaDescription: 'Ala Leste (Green)',
        initialCoordinates: [
          { pieceVariantId: 'KING', coordKey: '13,6', isRoyal: true },
          { pieceVariantId: 'QUEEN', coordKey: '13,7' },
          { pieceVariantId: 'ROOK', coordKey: '13,10' },
          { pieceVariantId: 'PAWN', coordKey: '12,6' },
        ],
      },
    ],
  },
  {
    id: 'FOUR_PLAYER_TEAMS',
    name: 'Four-Player Teams (2v2 Cross)',
    totalParticipants: 4,
    boardType: 'SQUARE_CROSS',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 4 }, (_, i) => buildRadialSpawn(i, 4, 7)),
  },
  {
    id: 'FOUR_PLAYER_SOLO',
    name: 'Four-Player Solo (Last King Standing)',
    totalParticipants: 4,
    boardType: 'SQUARE_CROSS',
    allowedEliminationPolicies: ['EVAPORATION', 'CONQUEST'],
    factions: Array.from({ length: 4 }, (_, i) => buildRadialSpawn(i, 4, 7)),
  },
  {
    id: 'CHATURAJI',
    name: 'Chaturaji (4 Cantos Histórico)',
    totalParticipants: 4,
    boardType: 'SQUARE_CROSS',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 4 }, (_, i) => buildRadialSpawn(i, 4, 6)),
  },
  {
    id: 'FORTRESS_5P',
    name: 'Fortress Pentagon (5P)',
    totalParticipants: 5,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 5 }, (_, i) => buildRadialSpawn(i, 5, 8)),
  },
  {
    id: 'STRONGHOLD_5P',
    name: 'Stronghold Star (5P)',
    totalParticipants: 5,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION', 'CONQUEST'],
    factions: Array.from({ length: 5 }, (_, i) => buildRadialSpawn(i, 5, 8)),
  },
  {
    id: 'CITADEL_5P',
    name: 'Citadel Circular Ring (5P)',
    totalParticipants: 5,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 5 }, (_, i) => buildRadialSpawn(i, 5, 9)),
  },
  {
    id: 'HEXAGON_SIX_PLAYER',
    name: 'Hexagon Six-Player FFA',
    totalParticipants: 6,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST', 'ZOMBIE_BOT'],
    factions: Array.from({ length: 6 }, (_, i) => buildRadialSpawn(i, 6, 10)),
  },
  {
    id: 'SIX_PLAYER_TEAMS',
    name: 'Six-Player Teams (3v3)',
    totalParticipants: 6,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION'],
    factions: Array.from({ length: 6 }, (_, i) => buildRadialSpawn(i, 6, 10)),
  },
  {
    id: 'MINI_HEXAGON_6P',
    name: 'Mini Hexagon Blitz (6P)',
    totalParticipants: 6,
    boardType: 'HEXAGON_RADIAL',
    allowedEliminationPolicies: ['EVAPORATION'],
    factions: Array.from({ length: 6 }, (_, i) => buildRadialSpawn(i, 6, 7)),
  },
  {
    id: 'SEVEN_PLAYER_FFA',
    name: 'Seven-Player Heptagon',
    totalParticipants: 7,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES'],
    factions: Array.from({ length: 7 }, (_, i) => buildRadialSpawn(i, 7, 11)),
  },
  {
    id: 'OCTAGON_FFA',
    name: 'Octagon Eight-Player FFA',
    totalParticipants: 8,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST'],
    factions: Array.from({ length: 8 }, (_, i) => buildRadialSpawn(i, 8, 12)),
  },
  {
    id: 'OCTAGON_TEAMS',
    name: 'Octagon Teams (4v4)',
    totalParticipants: 8,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION'],
    factions: Array.from({ length: 8 }, (_, i) => buildRadialSpawn(i, 8, 12)),
  },
  {
    id: 'NEXUS_10P',
    name: 'Nexus Decagon Arena (10P)',
    totalParticipants: 10,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'ZOMBIE_BOT'],
    factions: Array.from({ length: 10 }, (_, i) => buildRadialSpawn(i, 10, 13)),
  },
  {
    id: 'MINI_DODECAGON_12P',
    name: 'Mini Dodecagon Arena (12P - Capacidade Máxima)',
    totalParticipants: 12,
    boardType: 'DODECAGON_RING',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST', 'ZOMBIE_BOT'],
    factions: Array.from({ length: 12 }, (_, i) => buildRadialSpawn(i, 12, 14)),
  },
  {
    id: 'DIPLOMACY_CHESS',
    name: 'Diplomacy Chess (Turnos Simultâneos)',
    totalParticipants: 4,
    boardType: 'SQUARE_CROSS',
    allowedEliminationPolicies: ['EVAPORATION', 'GREY_OBSTACLES', 'CONQUEST'],
    factions: Array.from({ length: 4 }, (_, i) => buildRadialSpawn(i, 4, 8)),
  },
];

export class CompositeArenaLayouts {
  public static getLayout(id: ArenaModeId): IArenaLayoutDefinition | undefined {
    return ARENA_LAYOUTS.find((l) => l.id === id);
  }

  public static getAllLayouts(): readonly IArenaLayoutDefinition[] {
    return ARENA_LAYOUTS;
  }
}

