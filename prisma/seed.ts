// ============================================================
// prisma/seed.ts — MVP Seed Data
// Run with: npx prisma db seed
// Add to package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
// ============================================================

import { PrismaClient, PartCategory, SnapshotSource, AdjustmentType, PartCondition } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================
// SEED STRATEGY NOTES
//
// Phase 1 (seed.ts — this file):
//   - ~50 high-volume parts covering GPU/CPU/RAM/SSD
//   - ~100 aliases covering Korean marketplace shorthand
//   - ~200 baseline price snapshots (manually researched from Danawa/중고나라)
//   - All 9 core adjustment rules
//
// Phase 2 (scripts/import/batch-runner.ts):
//   - Automated imports when scrapers are ready
//   - Creates ImportBatch rows and bulk-inserts PriceSnapshot rows
//
// Phase 3 (v2 — not in MVP):
//   - User feedback on valuation accuracy → correction flow
//   - Auto-expanding aliases from rejected matches
// ============================================================

async function main() {
  console.log('🌱 Starting seed...')

  // ----------------------------------------------------------
  // 1. ADJUSTMENT RULES
  // Must be seeded first — app layer reads these at valuation time.
  // ----------------------------------------------------------
  console.log('  → Seeding adjustment rules...')

  await prisma.adjustmentRule.createMany({
    skipDuplicates: true,
    data: [
      // Condition-based multipliers
      {
        name: 'condition_new',
        ruleType: AdjustmentType.CONDITION,
        conditionKey: 'condition',
        conditionValue: 'NEW',
        multiplier: 1.0,
        priority: 10,
        description: '새 제품 — 보정 없음',
      },
      {
        name: 'condition_like_new',
        ruleType: AdjustmentType.CONDITION,
        conditionKey: 'condition',
        conditionValue: 'LIKE_NEW',
        multiplier: 0.88,
        priority: 10,
        description: '개봉만 한 상태 — 12% 할인',
      },
      {
        name: 'condition_good',
        ruleType: AdjustmentType.CONDITION,
        conditionKey: 'condition',
        conditionValue: 'GOOD',
        multiplier: 0.75,
        priority: 10,
        description: '사용감 적음 — 25% 할인',
      },
      {
        name: 'condition_fair',
        ruleType: AdjustmentType.CONDITION,
        conditionValue: 'FAIR',
        conditionKey: 'condition',
        multiplier: 0.60,
        priority: 10,
        description: '사용감 있음 — 40% 할인',
      },
      {
        name: 'condition_poor',
        ruleType: AdjustmentType.CONDITION,
        conditionKey: 'condition',
        conditionValue: 'POOR',
        multiplier: 0.40,
        priority: 10,
        description: '불량 또는 파손 포함 — 60% 할인',
      },
      // Age-based depreciation (applied on top of condition)
      {
        name: 'age_2_years',
        ruleType: AdjustmentType.AGE,
        conditionKey: 'releaseAge',
        conditionValue: '2',
        multiplier: 0.85,
        priority: 20,
        description: '출시 2년 이상 — 15% 추가 할인',
      },
      {
        name: 'age_4_years',
        ruleType: AdjustmentType.AGE,
        conditionKey: 'releaseAge',
        conditionValue: '4',
        multiplier: 0.70,
        priority: 20,
        description: '출시 4년 이상 — 30% 추가 할인',
      },
      {
        name: 'age_6_years',
        ruleType: AdjustmentType.AGE,
        conditionKey: 'releaseAge',
        conditionValue: '6',
        multiplier: 0.55,
        priority: 20,
        description: '출시 6년 이상 — 45% 추가 할인',
      },
      // Bundle discount
      {
        name: 'bundle_pc_discount',
        ruleType: AdjustmentType.BUNDLE,
        conditionKey: 'runType',
        conditionValue: 'FULL_PC',
        multiplier: 0.95,
        priority: 30,
        description: '풀시스템 번들 — 5% 추가 할인 (통매 관행)',
      },
    ],
  })

  // ----------------------------------------------------------
  // 2. PARTS CATALOG (GPU subset — expand to 50+ before launch)
  // ----------------------------------------------------------
  console.log('  → Seeding GPU parts...')

  const gpuParts = [
    // NVIDIA Ada Lovelace
    { brandName: 'NVIDIA', modelName: 'RTX 4090', fullName: 'NVIDIA GeForce RTX 4090', releaseYear: 2022, msrpKrw: 2_000_000, specJson: { vram_gb: 24, tdp_w: 450, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4080 SUPER', fullName: 'NVIDIA GeForce RTX 4080 SUPER', releaseYear: 2024, msrpKrw: 1_300_000, specJson: { vram_gb: 16, tdp_w: 320, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4080', fullName: 'NVIDIA GeForce RTX 4080', releaseYear: 2022, msrpKrw: 1_200_000, specJson: { vram_gb: 16, tdp_w: 320, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4070 Ti SUPER', fullName: 'NVIDIA GeForce RTX 4070 Ti SUPER', releaseYear: 2024, msrpKrw: 950_000, specJson: { vram_gb: 16, tdp_w: 285, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4070 SUPER', fullName: 'NVIDIA GeForce RTX 4070 SUPER', releaseYear: 2024, msrpKrw: 780_000, specJson: { vram_gb: 12, tdp_w: 220, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4070', fullName: 'NVIDIA GeForce RTX 4070', releaseYear: 2023, msrpKrw: 700_000, specJson: { vram_gb: 12, tdp_w: 200, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4060 Ti', fullName: 'NVIDIA GeForce RTX 4060 Ti', releaseYear: 2023, msrpKrw: 550_000, specJson: { vram_gb: 8, tdp_w: 165, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 4060', fullName: 'NVIDIA GeForce RTX 4060', releaseYear: 2023, msrpKrw: 420_000, specJson: { vram_gb: 8, tdp_w: 115, interface: 'PCIe 4.0' } },
    // NVIDIA Ampere
    { brandName: 'NVIDIA', modelName: 'RTX 3090 Ti', fullName: 'NVIDIA GeForce RTX 3090 Ti', releaseYear: 2022, msrpKrw: 1_600_000, specJson: { vram_gb: 24, tdp_w: 450, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3090', fullName: 'NVIDIA GeForce RTX 3090', releaseYear: 2020, msrpKrw: 1_450_000, specJson: { vram_gb: 24, tdp_w: 350, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3080 Ti', fullName: 'NVIDIA GeForce RTX 3080 Ti', releaseYear: 2021, msrpKrw: 1_000_000, specJson: { vram_gb: 12, tdp_w: 350, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3080', fullName: 'NVIDIA GeForce RTX 3080', releaseYear: 2020, msrpKrw: 900_000, specJson: { vram_gb: 10, tdp_w: 320, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3070 Ti', fullName: 'NVIDIA GeForce RTX 3070 Ti', releaseYear: 2021, msrpKrw: 720_000, specJson: { vram_gb: 8, tdp_w: 290, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3070', fullName: 'NVIDIA GeForce RTX 3070', releaseYear: 2020, msrpKrw: 640_000, specJson: { vram_gb: 8, tdp_w: 220, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3060 Ti', fullName: 'NVIDIA GeForce RTX 3060 Ti', releaseYear: 2020, msrpKrw: 480_000, specJson: { vram_gb: 8, tdp_w: 200, interface: 'PCIe 4.0' } },
    { brandName: 'NVIDIA', modelName: 'RTX 3060', fullName: 'NVIDIA GeForce RTX 3060', releaseYear: 2021, msrpKrw: 390_000, specJson: { vram_gb: 12, tdp_w: 170, interface: 'PCIe 3.0' } },
    // AMD RDNA3
    { brandName: 'AMD', modelName: 'RX 7900 XTX', fullName: 'AMD Radeon RX 7900 XTX', releaseYear: 2022, msrpKrw: 1_350_000, specJson: { vram_gb: 24, tdp_w: 355, interface: 'PCIe 4.0' } },
    { brandName: 'AMD', modelName: 'RX 7900 XT', fullName: 'AMD Radeon RX 7900 XT', releaseYear: 2022, msrpKrw: 1_050_000, specJson: { vram_gb: 20, tdp_w: 315, interface: 'PCIe 4.0' } },
    { brandName: 'AMD', modelName: 'RX 7800 XT', fullName: 'AMD Radeon RX 7800 XT', releaseYear: 2023, msrpKrw: 650_000, specJson: { vram_gb: 16, tdp_w: 263, interface: 'PCIe 4.0' } },
    { brandName: 'AMD', modelName: 'RX 7600', fullName: 'AMD Radeon RX 7600', releaseYear: 2023, msrpKrw: 370_000, specJson: { vram_gb: 8, tdp_w: 165, interface: 'PCIe 4.0' } },
  ]

  for (const p of gpuParts) {
    await prisma.part.upsert({
      where: {
        category_brandName_modelName: {
          category: PartCategory.GPU,
          brandName: p.brandName,
          modelName: p.modelName,
        },
      },
      update: {},
      create: { category: PartCategory.GPU, ...p },
    })
  }

  console.log('  → Seeding CPU parts...')
  const cpuParts = [
    // Intel Core 13th/14th gen
    { brandName: 'Intel', modelName: 'Core i9-14900K', fullName: 'Intel Core i9-14900K', releaseYear: 2023, msrpKrw: 700_000, specJson: { cores: 24, threads: 32, socket: 'LGA1700', tdp_w: 125 } },
    { brandName: 'Intel', modelName: 'Core i7-14700K', fullName: 'Intel Core i7-14700K', releaseYear: 2023, msrpKrw: 490_000, specJson: { cores: 20, threads: 28, socket: 'LGA1700', tdp_w: 125 } },
    { brandName: 'Intel', modelName: 'Core i5-14600K', fullName: 'Intel Core i5-14600K', releaseYear: 2023, msrpKrw: 330_000, specJson: { cores: 14, threads: 20, socket: 'LGA1700', tdp_w: 125 } },
    { brandName: 'Intel', modelName: 'Core i9-13900K', fullName: 'Intel Core i9-13900K', releaseYear: 2022, msrpKrw: 680_000, specJson: { cores: 24, threads: 32, socket: 'LGA1700', tdp_w: 125 } },
    { brandName: 'Intel', modelName: 'Core i7-13700K', fullName: 'Intel Core i7-13700K', releaseYear: 2022, msrpKrw: 470_000, specJson: { cores: 16, threads: 24, socket: 'LGA1700', tdp_w: 125 } },
    { brandName: 'Intel', modelName: 'Core i5-13600K', fullName: 'Intel Core i5-13600K', releaseYear: 2022, msrpKrw: 340_000, specJson: { cores: 14, threads: 20, socket: 'LGA1700', tdp_w: 125 } },
    // AMD Ryzen 7000 series
    { brandName: 'AMD', modelName: 'Ryzen 9 7950X', fullName: 'AMD Ryzen 9 7950X', releaseYear: 2022, msrpKrw: 850_000, specJson: { cores: 16, threads: 32, socket: 'AM5', tdp_w: 170 } },
    { brandName: 'AMD', modelName: 'Ryzen 7 7800X3D', fullName: 'AMD Ryzen 7 7800X3D', releaseYear: 2023, msrpKrw: 560_000, specJson: { cores: 8, threads: 16, socket: 'AM5', tdp_w: 120 } },
    { brandName: 'AMD', modelName: 'Ryzen 7 7700X', fullName: 'AMD Ryzen 7 7700X', releaseYear: 2022, msrpKrw: 430_000, specJson: { cores: 8, threads: 16, socket: 'AM5', tdp_w: 105 } },
    { brandName: 'AMD', modelName: 'Ryzen 5 7600X', fullName: 'AMD Ryzen 5 7600X', releaseYear: 2022, msrpKrw: 300_000, specJson: { cores: 6, threads: 12, socket: 'AM5', tdp_w: 105 } },
    // AMD Ryzen 5000 series
    { brandName: 'AMD', modelName: 'Ryzen 9 5950X', fullName: 'AMD Ryzen 9 5950X', releaseYear: 2020, msrpKrw: 820_000, specJson: { cores: 16, threads: 32, socket: 'AM4', tdp_w: 105 } },
    { brandName: 'AMD', modelName: 'Ryzen 7 5800X3D', fullName: 'AMD Ryzen 7 5800X3D', releaseYear: 2022, msrpKrw: 500_000, specJson: { cores: 8, threads: 16, socket: 'AM4', tdp_w: 105 } },
    { brandName: 'AMD', modelName: 'Ryzen 5 5600X', fullName: 'AMD Ryzen 5 5600X', releaseYear: 2020, msrpKrw: 290_000, specJson: { cores: 6, threads: 12, socket: 'AM4', tdp_w: 65 } },
  ]

  for (const p of cpuParts) {
    await prisma.part.upsert({
      where: {
        category_brandName_modelName: {
          category: PartCategory.CPU,
          brandName: p.brandName,
          modelName: p.modelName,
        },
      },
      update: {},
      create: { category: PartCategory.CPU, ...p },
    })
  }

  console.log('  → Clearing existing RAM seed data...')
  const existingRamParts = await prisma.part.findMany({
    where: { category: PartCategory.RAM },
    select: { id: true },
  })
  const existingRamPartIds = existingRamParts.map((p) => p.id)
  if (existingRamPartIds.length > 0) {
    await prisma.priceSnapshot.deleteMany({
      where: {
        partId: { in: existingRamPartIds },
        sourceType: SnapshotSource.SEED,
      },
    })
    await prisma.partAlias.deleteMany({
      where: {
        partId: { in: existingRamPartIds },
        source: 'seed',
      },
    })
  }

  console.log('  → Seeding RAM parts...')
  const ramParts = [
    { brandName: 'DDR4', modelName: '8GB Single', fullName: 'DDR4 8GB (단일)', releaseYear: 2018, msrpKrw: 45_000, specJson: { capacity_gb: 8, type: 'DDR4', kit: false } },
    { brandName: 'DDR4', modelName: '16GB Single', fullName: 'DDR4 16GB (단일)', releaseYear: 2018, msrpKrw: 80_000, specJson: { capacity_gb: 16, type: 'DDR4', kit: false } },
    { brandName: 'DDR4', modelName: '32GB Single', fullName: 'DDR4 32GB (단일)', releaseYear: 2020, msrpKrw: 150_000, specJson: { capacity_gb: 32, type: 'DDR4', kit: false } },
    { brandName: 'DDR4', modelName: '16GB Kit (2x8)', fullName: 'DDR4 16GB 키트 (2x8)', releaseYear: 2018, msrpKrw: 70_000, specJson: { capacity_gb: 16, type: 'DDR4', kit: true, sticks: 2 } },
    { brandName: 'DDR4', modelName: '32GB Kit (2x16)', fullName: 'DDR4 32GB 키트 (2x16)', releaseYear: 2020, msrpKrw: 130_000, specJson: { capacity_gb: 32, type: 'DDR4', kit: true, sticks: 2 } },
    { brandName: 'DDR5', modelName: '16GB Single', fullName: 'DDR5 16GB (단일)', releaseYear: 2022, msrpKrw: 90_000, specJson: { capacity_gb: 16, type: 'DDR5', kit: false } },
    { brandName: 'DDR5', modelName: '32GB Single', fullName: 'DDR5 32GB (단일)', releaseYear: 2022, msrpKrw: 160_000, specJson: { capacity_gb: 32, type: 'DDR5', kit: false } },
  ]

  for (const p of ramParts) {
    await prisma.part.upsert({
      where: {
        category_brandName_modelName: {
          category: PartCategory.RAM,
          brandName: p.brandName,
          modelName: p.modelName,
        },
      },
      update: {},
      create: { category: PartCategory.RAM, ...p },
    })
  }

  console.log('  → Clearing existing SSD seed data...')
  const existingSsdParts = await prisma.part.findMany({
    where: { category: PartCategory.SSD },
    select: { id: true },
  })
  const existingSsdPartIds = existingSsdParts.map((p) => p.id)
  if (existingSsdPartIds.length > 0) {
    await prisma.priceSnapshot.deleteMany({
      where: {
        partId: { in: existingSsdPartIds },
        sourceType: SnapshotSource.SEED,
      },
    })
    await prisma.partAlias.deleteMany({
      where: {
        partId: { in: existingSsdPartIds },
        source: 'seed',
      },
    })
  }

  console.log('  → Seeding SSD parts...')
  const ssdParts = [
    { brandName: 'SSD', modelName: '128GB', fullName: 'SSD 128GB', releaseYear: 2018, msrpKrw: 60_000, specJson: { capacity_gb: 128, interface: 'SATA/NVMe' } },
    { brandName: 'SSD', modelName: '256GB', fullName: 'SSD 256GB', releaseYear: 2018, msrpKrw: 80_000, specJson: { capacity_gb: 256, interface: 'SATA/NVMe' } },
    { brandName: 'SSD', modelName: '512GB', fullName: 'SSD 512GB', releaseYear: 2019, msrpKrw: 120_000, specJson: { capacity_gb: 512, interface: 'NVMe' } },
    { brandName: 'SSD', modelName: '1TB', fullName: 'SSD 1TB', releaseYear: 2020, msrpKrw: 200_000, specJson: { capacity_gb: 1024, interface: 'NVMe' } },
    { brandName: 'SSD', modelName: '2TB', fullName: 'SSD 2TB', releaseYear: 2021, msrpKrw: 350_000, specJson: { capacity_gb: 2048, interface: 'NVMe' } },
    { brandName: 'SSD', modelName: '4TB', fullName: 'SSD 4TB', releaseYear: 2022, msrpKrw: 700_000, specJson: { capacity_gb: 4096, interface: 'NVMe' } },
  ]

  for (const p of ssdParts) {
    await prisma.part.upsert({
      where: {
        category_brandName_modelName: {
          category: PartCategory.SSD,
          brandName: p.brandName,
          modelName: p.modelName,
        },
      },
      update: {},
      create: { category: PartCategory.SSD, ...p },
    })
  }

  // ----------------------------------------------------------
  // 3. PART ALIASES
  // Korean marketplace shorthand. All lowercase. Expand heavily before launch.
  // ----------------------------------------------------------
  console.log('  → Seeding part aliases...')

  const allParts = await prisma.part.findMany({ select: { id: true, brandName: true, modelName: true, category: true } })

  const findPart = (brand: string, model: string) =>
    allParts.find(p => p.brandName === brand && p.modelName === model)?.id

  const aliases: Array<{ partId: string; alias: string; source: string }> = []

  const gpuAliasMap: Record<string, string[]> = {
    'NVIDIA:RTX 4090':           ['4090', 'rtx4090', '지포스 4090', '4090 FE'],
    'NVIDIA:RTX 4080':           ['4080', 'rtx4080', '지포스 4080'],
    'NVIDIA:RTX 4070 Ti SUPER':  ['4070ti super', '4070 ti s', 'rtx4070tis'],
    'NVIDIA:RTX 4070 SUPER':     ['4070s', '4070 super', 'rtx4070s'],
    'NVIDIA:RTX 4070':           ['4070', 'rtx4070', '지포스 4070'],
    'NVIDIA:RTX 4060 Ti':        ['4060ti', '4060 ti', 'rtx4060ti'],
    'NVIDIA:RTX 4060':           ['4060', 'rtx4060'],
    'NVIDIA:RTX 3090':           ['3090', 'rtx3090', '지포스 3090'],
    'NVIDIA:RTX 3080 Ti':        ['3080ti', '3080 ti'],
    'NVIDIA:RTX 3080':           ['3080', 'rtx3080'],
    'NVIDIA:RTX 3070 Ti':        ['3070ti', '3070 ti'],
    'NVIDIA:RTX 3070':           ['3070', 'rtx3070'],
    'NVIDIA:RTX 3060 Ti':        ['3060ti', '3060 ti'],
    'NVIDIA:RTX 3060':           ['3060', 'rtx3060'],
    'AMD:RX 7900 XTX':           ['7900xtx', '7900 xtx', 'rx7900xtx'],
    'AMD:RX 7800 XT':            ['7800xt', '7800 xt', 'rx7800xt'],
    'AMD:RX 7600':               ['7600', 'rx7600'],
  }

  const cpuAliasMap: Record<string, string[]> = {
    'Intel:Core i9-14900K':     ['i9-14900k', '14900k', 'i9 14900k'],
    'Intel:Core i7-14700K':     ['i7-14700k', '14700k', 'i7 14700k'],
    'Intel:Core i5-14600K':     ['i5-14600k', '14600k', 'i5 14600k'],
    'Intel:Core i9-13900K':     ['i9-13900k', '13900k', 'i9 13900k'],
    'Intel:Core i7-13700K':     ['i7-13700k', '13700k', 'i7 13700k'],
    'Intel:Core i5-13600K':     ['i5-13600k', '13600k', 'i5 13600k'],
    'AMD:Ryzen 9 7950X':        ['7950x', 'r9 7950x', 'ryzen9 7950x'],
    'AMD:Ryzen 7 7800X3D':      ['7800x3d', 'r7 7800x3d', '라이젠 7800x3d'],
    'AMD:Ryzen 7 7700X':        ['7700x', 'r7 7700x'],
    'AMD:Ryzen 5 7600X':        ['7600x', 'r5 7600x'],
    'AMD:Ryzen 7 5800X3D':      ['5800x3d', 'r7 5800x3d', '라이젠 5800x3d'],
    'AMD:Ryzen 5 5600X':        ['5600x', 'r5 5600x', '라이젠 5600x'],
  }

  const ramAliasMap: Record<string, string[]> = {
    'DDR4:8GB Single':       ['ddr4 8gb', 'ddr4 8g', '램 8gb', '메모리 8gb'],
    'DDR4:16GB Single':      ['ddr4 16gb', 'ddr4 16g', '램 16gb', '메모리 16gb'],
    'DDR4:32GB Single':      ['ddr4 32gb', 'ddr4 32g', '램 32gb', '메모리 32gb'],
    'DDR4:16GB Kit (2x8)':   ['ddr4 16gb kit', 'ddr4 8x2', '16gb 2x8', 'ddr4 16g x2'],
    'DDR4:32GB Kit (2x16)':  ['ddr4 32gb kit', 'ddr4 16x2', '32gb 2x16', 'ddr4 32g x2'],
    'DDR5:16GB Single':      ['ddr5 16gb', 'ddr5 16g', 'ddr5 램 16gb'],
    'DDR5:32GB Single':      ['ddr5 32gb', 'ddr5 32g', 'ddr5 램 32gb'],
  }

  const ssdAliasMap: Record<string, string[]> = {
    'SSD:128GB': ['ssd 128gb', '128gb ssd', '128g ssd', 'ssd 128g'],
    'SSD:256GB': ['ssd 256gb', '256gb ssd', '256g ssd', 'ssd 256g'],
    'SSD:512GB': ['ssd 512gb', '512gb ssd', '512g ssd', 'ssd 512g'],
    'SSD:1TB':   ['ssd 1tb', '1tb ssd', 'ssd 1024gb', '1tb nvme'],
    'SSD:2TB':   ['ssd 2tb', '2tb ssd', 'ssd 2048gb', '2tb nvme'],
    'SSD:4TB':   ['ssd 4tb', '4tb ssd', 'ssd 4096gb', '4tb nvme'],
  }

  for (const [key, aliasList] of Object.entries({ ...gpuAliasMap, ...cpuAliasMap, ...ramAliasMap, ...ssdAliasMap })) {
    const [brand, model] = key.split(':')
    const partId = findPart(brand, model)
    if (!partId) continue
    for (const alias of aliasList) {
      aliases.push({ partId, alias: alias.toLowerCase(), source: 'seed' })
    }
  }

  await prisma.partAlias.createMany({ data: aliases, skipDuplicates: true })

  // ----------------------------------------------------------
  // 4. PRICE SNAPSHOTS (baseline — manually researched)
  // These represent approximate Korean used-market prices as of seed time.
  // App layer uses these until live imports kick in.
  // ----------------------------------------------------------
  console.log('  → Seeding baseline price snapshots...')

  const seedBatch = await prisma.importBatch.create({
    data: {
      source: SnapshotSource.SEED,
      status: 'COMPLETED',
      startedAt: new Date(),
      completedAt: new Date(),
      recordCount: 0, // updated below
    },
  })

  // Helper: create snapshots for a part
  type SnapshotInput = { condition: PartCondition; priceKrw: number }
  async function seedSnapshots(brand: string, model: string, prices: SnapshotInput[]) {
    const part = allParts.find(p => p.brandName === brand && p.modelName === model)
    if (!part) return 0
    await prisma.priceSnapshot.createMany({
      data: prices.map(p => ({
        partId: part.id,
        batchId: seedBatch.id,
        sourceType: SnapshotSource.SEED,
        priceKrw: p.priceKrw,
        condition: p.condition,
        rawText: `[SEED] ${brand} ${model} — ${p.condition} — ₩${p.priceKrw.toLocaleString()}`,
      })),
    })
    return prices.length
  }

  // GPU seed prices (approximate 2025 Korean used-market range)
  let snapshotCount = 0
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 4090', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 1_650_000 },
    { condition: PartCondition.GOOD, priceKrw: 1_500_000 },
    { condition: PartCondition.FAIR, priceKrw: 1_300_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 4080', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 1_050_000 },
    { condition: PartCondition.GOOD, priceKrw: 950_000 },
    { condition: PartCondition.FAIR, priceKrw: 820_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 4070 SUPER', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 680_000 },
    { condition: PartCondition.GOOD, priceKrw: 600_000 },
    { condition: PartCondition.FAIR, priceKrw: 510_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 4070', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 580_000 },
    { condition: PartCondition.GOOD, priceKrw: 520_000 },
    { condition: PartCondition.FAIR, priceKrw: 440_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 3080', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 500_000 },
    { condition: PartCondition.GOOD, priceKrw: 430_000 },
    { condition: PartCondition.FAIR, priceKrw: 350_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 3070', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 350_000 },
    { condition: PartCondition.GOOD, priceKrw: 300_000 },
    { condition: PartCondition.FAIR, priceKrw: 250_000 },
  ])
  snapshotCount += await seedSnapshots('NVIDIA', 'RTX 3060 Ti', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 280_000 },
    { condition: PartCondition.GOOD, priceKrw: 240_000 },
    { condition: PartCondition.FAIR, priceKrw: 200_000 },
  ])

  // CPU seed prices
  snapshotCount += await seedSnapshots('Intel', 'Core i9-14900K', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 570_000 },
    { condition: PartCondition.GOOD, priceKrw: 500_000 },
  ])
  snapshotCount += await seedSnapshots('Intel', 'Core i5-13600K', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 280_000 },
    { condition: PartCondition.GOOD, priceKrw: 240_000 },
  ])
  snapshotCount += await seedSnapshots('AMD', 'Ryzen 7 7800X3D', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 450_000 },
    { condition: PartCondition.GOOD, priceKrw: 400_000 },
  ])
  snapshotCount += await seedSnapshots('AMD', 'Ryzen 5 5600X', [
    { condition: PartCondition.LIKE_NEW, priceKrw: 180_000 },
    { condition: PartCondition.GOOD, priceKrw: 150_000 },
  ])

  // RAM seed prices (2025 당근/번개장터 중고 시세 기준)
  snapshotCount += await seedSnapshots('DDR4', '8GB Single', [
    { condition: PartCondition.GOOD, priceKrw: 25_000 },
  ])
  snapshotCount += await seedSnapshots('DDR4', '16GB Single', [
    { condition: PartCondition.GOOD, priceKrw: 70_000 },
  ])
  snapshotCount += await seedSnapshots('DDR4', '32GB Single', [
    { condition: PartCondition.GOOD, priceKrw: 120_000 },
  ])
  snapshotCount += await seedSnapshots('DDR4', '16GB Kit (2x8)', [
    { condition: PartCondition.GOOD, priceKrw: 55_000 },
  ])
  snapshotCount += await seedSnapshots('DDR4', '32GB Kit (2x16)', [
    { condition: PartCondition.GOOD, priceKrw: 100_000 },
  ])
  snapshotCount += await seedSnapshots('DDR5', '16GB Single', [
    { condition: PartCondition.GOOD, priceKrw: 65_000 },
  ])
  snapshotCount += await seedSnapshots('DDR5', '32GB Single', [
    { condition: PartCondition.GOOD, priceKrw: 110_000 },
  ])

  // SSD seed prices (2025 당근/번개장터 중고 시세 기준)
  snapshotCount += await seedSnapshots('SSD', '128GB', [
    { condition: PartCondition.GOOD, priceKrw: 35_000 },
  ])
  snapshotCount += await seedSnapshots('SSD', '256GB', [
    { condition: PartCondition.GOOD, priceKrw: 50_000 },
  ])
  snapshotCount += await seedSnapshots('SSD', '512GB', [
    { condition: PartCondition.GOOD, priceKrw: 100_000 },
  ])
  snapshotCount += await seedSnapshots('SSD', '1TB', [
    { condition: PartCondition.GOOD, priceKrw: 200_000 },
  ])
  snapshotCount += await seedSnapshots('SSD', '2TB', [
    { condition: PartCondition.GOOD, priceKrw: 300_000 },
  ])
  snapshotCount += await seedSnapshots('SSD', '4TB', [
    { condition: PartCondition.GOOD, priceKrw: 700_000 },
  ])

  // Update batch record count
  await prisma.importBatch.update({
    where: { id: seedBatch.id },
    data: { recordCount: snapshotCount },
  })

  console.log(`✅ Seed complete. Inserted:`)
  console.log(`   ${allParts.length} parts, ${aliases.length} aliases, ${snapshotCount} snapshots, 9 adjustment rules`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
