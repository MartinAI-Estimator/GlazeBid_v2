import React, { useState } from 'react'
import { QuoteProvider, useQuote } from './context/QuoteContext'
import Header from './components/Header'
import TabBar from './components/TabBar'
import SummaryTab from './components/SummaryTab'
import ScopeTab from './components/ScopeTab'
import GrandTotalBar from './components/GrandTotalBar'
import './styles/globals.css'

function QuickQuoteContent({ onBack, onSignOut, onVendors }) {
  const { sheetNames } = useQuote()
  const [activeTab, setActiveTab] = useState('summary')

  return (
    <div className="qq-root">
      <div className="app">
        <Header extraLeft={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginRight: 8 }}>
            {onBack && (
              <button onClick={onBack} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'none', padding: 0, whiteSpace: 'nowrap' }}>← Back</button>
            )}
            {onVendors && (
              <button onClick={onVendors} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Vendors
              </button>
            )}
            {onSignOut && (
              <button onClick={onSignOut} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Sign out
              </button>
            )}
          </div>
        } />
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main-content">
          {activeTab === 'summary' && <SummaryTab />}
          {sheetNames.map((name, i) =>
            activeTab === `scope-${i}` && (
              <ScopeTab key={i} scopeIndex={i} scopeName={name} />
            )
          )}
        </main>
        <GrandTotalBar />
      </div>
    </div>
  )
}

export default function QuickQuoteApp({ onBack, onSignOut, onVendors }) {
  return (
    <QuoteProvider>
      <QuickQuoteContent onBack={onBack} onSignOut={onSignOut} onVendors={onVendors} />
    </QuoteProvider>
  )
}
