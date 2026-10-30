"""均衡値の厳密計算（検証用）。

簡約 Leduc（J・Q・K 各2枚、アンティ1、ベット2→4、レイズなし）を sequence form の線形計画法
（Koller, Megiddo & von Stengel 1996）で解き、先手の均衡値を出す。TS のエンジンとは独立に書いてある。

    python3 scripts/lp_equilibrium.py      # scipy が必要（pip install scipy）

出力の値を scripts/generate-presets.ts の EQUILIBRIUM_VALUE_LP に転記する。
CFR の結果（presets.json の equilibriumValueP0）がこの値の近くにあることが、CFR 実装の検証になる。
"""
from fractions import Fraction as F
from itertools import product
import numpy as np
from scipy.optimize import linprog

RANKS = ['J', 'Q', 'K']
RV = {'J': 0, 'Q': 1, 'K': 2}
ANTE, BET = 1, {1: 2, 2: 4}

def deals():
    deck = [r for r in RANKS for _ in range(2)]
    out = {}
    for i, j, k in product(range(6), repeat=3):
        if len({i, j, k}) < 3: continue
        key = (deck[i], deck[j], deck[k])
        out[key] = out.get(key, 0) + 1
    tot = sum(out.values())
    return [(h0, h1, b, F(n, tot)) for (h0, h1, b), n in out.items()]

def showdown(h0, h1, b):  # +1 P0 wins, -1 P1 wins, 0 split
    p0, p1 = h0 == b, h1 == b
    if p0 != p1: return 1 if p0 else -1
    return (RV[h0] > RV[h1]) - (RV[h0] < RV[h1])

# sequences: index 0 = empty; each infoset has 2 actions -> 2 sequences
class Seqs:
    def __init__(self):
        self.idx = {None: 0}; self.infosets = {}  # infoset -> (parent_seq, [seq_a, seq_b])
    def get(self, infoset, parent):
        if infoset not in self.infosets:
            ids = []
            for a in ('agg', 'pas'):   # agg = bet/call, pas = check/fold
                self.idx[(infoset, a)] = len(self.idx); ids.append(self.idx[(infoset, a)])
            self.infosets[infoset] = (parent, ids)
        return self.infosets[infoset][1]

S = [Seqs(), Seqs()]
payoff = {}  # (seq0, seq1) -> accumulated P0 payoff * chance

def add(s0, s1, v):
    payoff[(s0, s1)] = payoff.get((s0, s1), 0) + v

def round_(rnd, hist, cards, par, prob, cont):
    """Generic betting round: P0 acts first. cards=(h0,h1,b|None). par=[seq0, seq1]. cont(outcome, par, invested_add)."""
    h0, h1, b = cards
    def info(p, kind, r1hist=None):
        hand = h0 if p == 0 else h1
        return (rnd, kind, hand) if rnd == 1 else (rnd, kind, hand, b, hist)
    bet = BET[rnd]
    # P0: bet / check
    p0_bet, p0_chk = S[0].get(info(0, 'bet'), par[0])
    # after P0 bet: P1 call / fold
    c1, f1 = S[1].get(info(1, 'call'), par[1])
    add(p0_bet, f1, prob * cont('fold1', None, None))  # P1 folds
    cont('both', [p0_bet, c1], ('p0bet', bet))
    # after P0 check: P1 bet / check
    b1, k1 = S[1].get(info(1, 'bet'), par[1])
    cont('check', [p0_chk, k1], ('check', 0))
    # P1 bet: P0 call / fold
    c0, f0 = S[0].get(info(0, 'call'), p0_chk)
    add(f0, b1, prob * cont('fold0', None, None))
    cont('both', [c0, b1], ('p1bet', bet))

def build():
    for h0, h1, b, prob in deals():
        sd = showdown(h0, h1, b)
        def cont1(outcome, par, inv):
            if outcome == 'fold1': return +ANTE        # P1 folds: P0 wins ante
            if outcome == 'fold0': return -ANTE
            kind, amt = inv
            pot_each = ANTE + amt
            hist = {'p0bet': 'p0bet', 'p1bet': 'p1bet', 'check': 'check'}[kind]
            def cont2(outcome2, par2, inv2):
                if outcome2 == 'fold1': return +pot_each
                if outcome2 == 'fold0': return -pot_each
                _, amt2 = inv2
                add(par2[0], par2[1], prob * sd * (pot_each + amt2))
                return None
            round_(2, hist, (h0, h1, b), par, prob, cont2)
            return None
        round_(1, None, (h0, h1, b), [0, 0], prob, cont1)

build()
n0, n1 = len(S[0].idx), len(S[1].idx)
A = np.zeros((n0, n1))
for (i, j), v in payoff.items(): A[i, j] += float(v)
print('infosets', len(S[0].infosets), len(S[1].infosets), 'sequences', n0, n1)

def constraints(seqs):
    rows = [np.zeros(len(seqs.idx))]; rows[0][0] = 1; rhs = [1.0]
    for info, (par, ids) in seqs.infosets.items():
        r = np.zeros(len(seqs.idx)); r[ids[0]] = 1; r[ids[1]] = 1; r[par] = -1
        rows.append(r); rhs.append(0.0)
    return np.array(rows), np.array(rhs)

E, e = constraints(S[0]); Fm, f = constraints(S[1])
# max_{x,q} f^T q  s.t.  F^T q - A^T x <= 0,  E x = e,  x >= 0
m1 = Fm.shape[0]
c = np.concatenate([np.zeros(n0), -f])
A_ub = np.hstack([-A.T, Fm.T]); b_ub = np.zeros(n1)
A_eq = np.hstack([E, np.zeros((E.shape[0], m1))]); b_eq = e
bounds = [(0, None)] * n0 + [(None, None)] * m1
res = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq, bounds=bounds, method='highs')
assert res.status == 0, res.message
v = -res.fun
print('game value (P0, chips/hand) =', round(v, 6))
# exact-ish rational guess
print('as fraction ~', F(v).limit_denominator(20000))
# Also solve from P1 side to double check
res2 = linprog(np.concatenate([np.zeros(n1), -e]), A_ub=np.hstack([A, E.T]), b_ub=np.zeros(n0),
               A_eq=np.hstack([Fm, np.zeros((m1, E.shape[0]))]), b_eq=f,
               bounds=[(0, None)] * n1 + [(None, None)] * E.shape[0], method='highs')
print('P1-side LP value (should equal v) =', round(res2.fun, 6))
