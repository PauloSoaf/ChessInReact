/**
 * ChessInReact - Unified Variants Subsystem (Spec 13)
 */

export * from './interfaces/IVariantDefinition';
export * from './catalog/VariantCatalog';
export * from './catalog/ClassicVariantsCatalog';
export * from './catalog/MagicalVariantsCatalog';
export * from './catalog/GeometricVariantsCatalog';
export * from './catalog/HistoricalVariantsCatalog';
export * from './spells/OfficialSpellEngine';
export * from './spells/ExpandedSpellEngine';
export * from './historical/ShatranjEngine';
export * from './historical/ShogiEngine';
export * from './historical/XiangqiEngine';
export * from './historical/MakrukEngine';
export * from './modifiers/AtomicExplosionModifier';
export * from './modifiers/AntichessForcedCapture';
export * from './modifiers/ThreeCheckTracker';
export * from './modifiers/KingOfTheHillEvaluator';
export * from './modifiers/RacingKingsValidator';
export * from './modifiers/DuckPlacementModifier';
export * from './modifiers/AliceBoardTeleportModifier';

