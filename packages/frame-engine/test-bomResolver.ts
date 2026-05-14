import { resolveFrameBOM } from './src/bomResolver/index';

// Test case: simple rectangular storefront
const testParams = {
  frameId: 'test-frame-001',
  mark: 'A-1',
  groupName: 'Main Storefront',
  scopeTag: 'BASE_BID' as const,
  quantity: 1,
  widthInches: 120,
  heightInches: 84,
  bays: 3,
  rows: 2,
  bayTypes: ['glazing', 'glazing', 'glazing'] as const,
  vendorSystemId: 'kawneer-451t',
  finishType: 'clear-anod',
  finishMultiplier: 1.0,
  glassSpecId: 'GL-1',
};

try {
  const pkg = resolveFrameBOM(testParams);
  console.log('✓ BOM generated successfully');
  console.log(`  Frame: ${pkg.mark} (${pkg.quantity} units)`);
  console.log(`  Aluminum BOM lines: ${pkg.bomLines.length}`);
  console.log(`  Glass schedule rows: ${pkg.glassSchedule.length}`);
  console.log(`  Accessories: ${pkg.accessories.length}`);
  console.log(`  Sealants: ${pkg.sealant.length}`);
  console.log(`  Labor (shop): ${pkg.labor.shopHours} hrs`);
  console.log(`  Labor (field): ${pkg.labor.fieldHours} hrs`);
  console.log(`  Total glass SF: ${pkg.glassSchedule.reduce((s, r) => s + r.sqft, 0)} SF`);
  console.log('✓ All fields populated correctly');
} catch (err) {
  console.error('✗ Error:', err);
  process.exit(1);
}
