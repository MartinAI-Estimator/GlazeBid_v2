import React from 'react'
import FramingSection from './sections/FramingSection'
import GlassSection   from './sections/GlassSection'
import DoorsSection   from './sections/DoorsSection'
import MiscSection    from './sections/MiscSection'
import LaborSection   from './sections/LaborSection'
import ScopeSidebar   from './ScopeSidebar'

export default function ScopeTab({ scopeIndex, scopeName }) {
  return (
    <div className="scope-layout">
      <div className="scope-sections">
        <FramingSection scopeIndex={scopeIndex} />
        <GlassSection   scopeIndex={scopeIndex} />
        <DoorsSection   scopeIndex={scopeIndex} />
        <MiscSection    scopeIndex={scopeIndex} />
        <LaborSection   scopeIndex={scopeIndex} />
      </div>
      <ScopeSidebar scopeIndex={scopeIndex} scopeName={scopeName} />
    </div>
  )
}
