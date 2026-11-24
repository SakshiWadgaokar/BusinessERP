import 'dotenv/config';
import { ItemType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CatalogCategory {
  name: string;
  description: string;
  items: Array<{
    sku: string;
    name: string;
    description: string;
    uomCode: string;
    minStockLevel: string;
    reorderLevel: string;
  }>;
}

const CATALOG: CatalogCategory[] = [
  {
    name: 'Milking Machines',
    description: 'Agricultural and dairy-farming milking machine systems',
    items: [
      {
        sku: 'MM-NANO-001',
        name: 'Nano Milking Machine',
        description: 'Compact single-bucket / nano model',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'MM-ECO-002',
        name: 'Eco Milking Machine / Eco Dry',
        description: '150 LPM dry variant',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'MM-SGL-003',
        name: 'Single Bucket Milking Machine',
        description: 'Includes VM 350 Nano Plus and engine-operated variants',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'MM-BUF-004',
        name: 'Buffalo Milking Machine',
        description: 'Dedicated buffalo milking machine model',
        uomCode: 'NOS',
        minStockLevel: '3',
        reorderLevel: '10',
      },
      {
        sku: 'MM-DBL-005',
        name: 'Double Bucket / Trolley Milking Machine',
        description: 'Double bucket trolley-mounted milking machine',
        uomCode: 'NOS',
        minStockLevel: '3',
        reorderLevel: '10',
      },
      {
        sku: 'MM-MLT-006',
        name: 'Four Bucket & 5–10 Bucket Milking Machines',
        description: 'High-capacity four-bucket and 5–10 bucket milking systems',
        uomCode: 'NOS',
        minStockLevel: '2',
        reorderLevel: '5',
      },
    ],
  },
  {
    name: 'Milking Machine Spares & Accessories',
    description: 'Replacement parts, claws, pulsators, cans, and hygiene accessories',
    items: [
      {
        sku: 'SP-PLS-001',
        name: 'Pulsators and Pulsator Repair Kits',
        description: 'Milking machine pulsators and complete repair kits',
        uomCode: 'PCS',
        minStockLevel: '20',
        reorderLevel: '50',
      },
      {
        sku: 'SP-TUB-002',
        name: 'Pulse Tubes, Pressure Regulators & Pressure Gauges',
        description: 'Pulse tubes, vacuum pressure regulators, and pressure gauges',
        uomCode: 'PCS',
        minStockLevel: '25',
        reorderLevel: '60',
      },
      {
        sku: 'SP-CLW-003',
        name: 'Milk Claws',
        description: 'Upper lid and milk claw assemblies',
        uomCode: 'PCS',
        minStockLevel: '15',
        reorderLevel: '40',
      },
      {
        sku: 'SP-BOT-004',
        name: 'Calf / Feeding Bottles',
        description: 'Dairy calf feeding bottles',
        uomCode: 'PCS',
        minStockLevel: '25',
        reorderLevel: '60',
      },
      {
        sku: 'SP-CAN-005',
        name: 'Transport Milk Cans',
        description: 'Hygienic dairy transport milk cans',
        uomCode: 'PCS',
        minStockLevel: '15',
        reorderLevel: '40',
      },
      {
        sku: 'SP-ACC-006',
        name: 'Dip Cups, Pillar Cocks & Stainless Steel Cleaning Brushes',
        description: 'Teat dip cups, pillar cocks, and stainless steel cleaning brushes',
        uomCode: 'PCS',
        minStockLevel: '25',
        reorderLevel: '60',
      },
    ],
  },
  {
    name: 'Vacuum Pumps',
    description: 'Oil-lubricated and dry vacuum pumps from 150 LPM to 650 LPM',
    items: [
      {
        sku: 'VP-150-001',
        name: 'Vacuum Pump — 150 LPM (Oil-Lubricated / Dry)',
        description: '150 LPM capacity oil-lubricated and dry vacuum pump variant',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'VP-200-002',
        name: 'Vacuum Pump — 200 LPM (Oil-Lubricated / Dry)',
        description: '200 LPM capacity oil-lubricated and dry vacuum pump variant',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'VP-500-003',
        name: 'Vacuum Pump — 500 LPM (Oil-Lubricated / Dry)',
        description: '500 LPM capacity oil-lubricated and dry vacuum pump variant',
        uomCode: 'NOS',
        minStockLevel: '3',
        reorderLevel: '10',
      },
      {
        sku: 'VP-650-004',
        name: 'Vacuum Pump — High Capacity (Up to 650 LPM)',
        description: 'Oil-lubricated and dry vacuum pump variants available from 150 LPM to 650 LPM',
        uomCode: 'NOS',
        minStockLevel: '2',
        reorderLevel: '6',
      },
    ],
  },
  {
    name: 'Chaff Cutter Machines',
    description: 'Motorized, air-cooled, and heavy-duty blower chaff cutters',
    items: [
      {
        sku: 'CC-FWD-001',
        name: 'Forward Gear Chaff Cutter',
        description: 'Air-cooled / motorized options',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'CC-DWN-002',
        name: 'Down Blower Chaff Cutter',
        description: '2-blade and heavy-duty models',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'CC-700-003',
        name: 'Sai 700 G RF Chaff Cutter',
        description: 'Sai 700 G RF chaff cutter machine',
        uomCode: 'NOS',
        minStockLevel: '4',
        reorderLevel: '12',
      },
      {
        sku: 'CC-1000-004',
        name: 'Sai 1000 Blower Chaff Cutter',
        description: 'Sai 1000 blower chaff cutter machine',
        uomCode: 'NOS',
        minStockLevel: '4',
        reorderLevel: '12',
      },
    ],
  },
  {
    name: 'Rubber & Cow Mats',
    description: 'Dairy livestock rubber flooring, cow mats, buffalo mats, and interlocking mats',
    items: [
      {
        sku: 'RM-COW-001',
        name: 'Cow Mats & Buffalo Mats',
        description: 'Heavy-duty rubber cow mats and buffalo mats',
        uomCode: 'PCS',
        minStockLevel: '20',
        reorderLevel: '50',
      },
      {
        sku: 'RM-INT-002',
        name: 'Interlocking Rubber Mats & Pet Mats',
        description: 'Interlocking rubber flooring mats and pet mats',
        uomCode: 'PCS',
        minStockLevel: '20',
        reorderLevel: '50',
      },
    ],
  },
  {
    name: 'Silage & Packaging',
    description: 'Agricultural fodder preservation and bulk packaging bags',
    items: [
      {
        sku: 'SL-BAG-001',
        name: 'Silage Bags',
        description: 'Agricultural silage storage bags',
        uomCode: 'PCS',
        minStockLevel: '50',
        reorderLevel: '200',
      },
      {
        sku: 'SL-JMB-002',
        name: 'Jumbo Packaging Bags',
        description: 'Heavy-duty jumbo packaging bags',
        uomCode: 'PCS',
        minStockLevel: '50',
        reorderLevel: '200',
      },
    ],
  },
  {
    name: 'Other Farm & Industrial Equipment',
    description: 'Additional agricultural, dairy, and industrial farm machinery',
    items: [
      {
        sku: 'FE-GRB-001',
        name: 'Grass Brushes',
        description: 'Farm grass cleaning brushes',
        uomCode: 'PCS',
        minStockLevel: '10',
        reorderLevel: '30',
      },
      {
        sku: 'FE-PAD-002',
        name: 'Paddy / Rice Cutters',
        description: 'Paddy and rice harvesting cutters',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'FE-WED-003',
        name: 'Weed / Brush Cutters',
        description: 'Agricultural weed and brush cutters',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
      {
        sku: 'FE-SCB-004',
        name: 'Swinging Cow Brushes',
        description: 'Swinging dairy cow grooming brushes',
        uomCode: 'NOS',
        minStockLevel: '4',
        reorderLevel: '10',
      },
      {
        sku: 'FE-CLM-005',
        name: 'Cow Lifting Machines',
        description: 'Livestock and cow lifting machines',
        uomCode: 'NOS',
        minStockLevel: '2',
        reorderLevel: '6',
      },
      {
        sku: 'FE-HPW-006',
        name: 'High-Pressure Washing Pumps',
        description: 'Farm and industrial high-pressure washing pumps',
        uomCode: 'NOS',
        minStockLevel: '5',
        reorderLevel: '15',
      },
    ],
  },
];

async function main() {
  const uoms = await prisma.unitOfMeasurement.findMany();
  const uomMap = new Map(uoms.map((u) => [u.code, u.id]));
  const fallbackUomId = uomMap.get('NOS') || uomMap.get('PCS') || uoms[0]?.id;
  if (!fallbackUomId) {
    throw new Error('No Units of Measurement found. Run prisma:seed first.');
  }

  let catCount = 0;
  let itemCount = 0;

  for (const cat of CATALOG) {
    const dbCat = await prisma.itemCategory.upsert({
      where: { name: cat.name },
      update: { description: cat.description, itemType: ItemType.FINISHED_GOOD, isActive: true },
      create: {
        name: cat.name,
        description: cat.description,
        itemType: ItemType.FINISHED_GOOD,
        isActive: true,
      },
    });
    catCount++;

    for (const prod of cat.items) {
      const uomId = uomMap.get(prod.uomCode) || fallbackUomId;
      await prisma.item.upsert({
        where: { sku: prod.sku },
        update: {
          name: prod.name,
          description: prod.description,
          categoryId: dbCat.id,
          uomId,
          itemType: ItemType.FINISHED_GOOD,
          visibleToDealers: true,
          isActive: true,
        },
        create: {
          sku: prod.sku,
          name: prod.name,
          description: prod.description,
          categoryId: dbCat.id,
          uomId,
          itemType: ItemType.FINISHED_GOOD,
          standardSellPrice: '0.00',
          standardCost: '0.0000',
          minStockLevel: prod.minStockLevel,
          reorderLevel: prod.reorderLevel,
          visibleToDealers: true,
          isActive: true,
        },
      });
      itemCount++;
    }
  }

  console.log(`Catalog seed complete: ${catCount} categories and ${itemCount} products upserted.`);
}

main()
  .catch((err) => {
    console.error('Catalog seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
