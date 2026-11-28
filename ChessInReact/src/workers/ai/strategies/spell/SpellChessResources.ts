import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId } from '../../../../core/coordinates';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';

/** A charge has the same centipawn unit throughout evaluation and exchange search. */
export class SpellChessResources {
  public static readonly freezeCp = 60;
  public static readonly jumpCp = 100;
  public static inventory(domain: IDomainState, player: PlayerId): number {
    const s = OfficialSpellRules.getState(domain);
    const value = (c: typeof s.whiteCharges) => c.freezeCharges * this.freezeCp + c.jumpCharges * this.jumpCp;
    return player === 'P1' ? value(s.whiteCharges) - value(s.blackCharges) : value(s.blackCharges) - value(s.whiteCharges);
  }
}
