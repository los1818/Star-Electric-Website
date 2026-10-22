# Accubid inventory import

Loads a **Trimble Accubid** inventory export (the `.xlsx` with an `Ext` "Extension" sheet) into
Sparks: one inventory item per line, with Trimble's pricing kept as-is, plus warehouse stock.

> **Never commit the export or the reports.** They contain supplier costs. `*.xlsx`, `*.csv` and
> `scripts/*/reports/` are git-ignored.

## What it reads

| Accubid column | Sparks field |
|---|---|
| Description | `description` (padding collapsed); SKU `TRM-xxxxxxxx` is derived from it |
| Quantity | stock at the warehouse (`--location`, default `WH`) |
| Price Unit (E / C / M) | `priceUnit`: price is per each, per 100 or per 1000 |
| Trade Price, Disc %, Net Cost | `tradePriceCents`, `discountBp`, `costCents` |
| Date | `priceDate` (when the price was last updated) |
| DB Labor, Labor Unit | `laborHours` per `laborUnit` (estimating labour) |
| Labor Condition = "No Labor" | `noLabor` |
| Totals row | used to check the import reconciles |

Category (Conduit, Wire, Boxes, Devices, Breakers, Lighting, Fasteners, Misc) and unit (ft / each)
are **guessed** from the description and can be corrected in Sparks. Items store **cost only**:
sell prices are set on each quote or invoice with that job's markup.

## What it checks

- Blank quantity on a line that has a value (inferred when it divides out exactly)
- Line value that doesn't match quantity × cost
- The same description listed twice: merged into one item, stock summed, weighted-average cost
- Prices not updated in over 3 years
- Zero stock
- The sheet's Totals row against the imported total

## Commands (from `sparks/`)

```bash
# Dry run: writes a report to scripts/import-accubid-inventory/reports/, changes nothing
npm run inventory:import -- --file ~/Downloads/Inventory.xlsx

# Load it (safe to re-run: items are matched by SKU and updated)
npm run inventory:import -- --file ~/Downloads/Inventory.xlsx --apply
```
