/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

const LOGO_URL = 'https://eudwjgdijylsgcnncxeg.supabase.co/storage/v1/object/public/email-assets/logo-icon.webp'

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="sk" dir="ltr">
    <Head />
    <Preview>Váš overovací kód – PAPI HAIR DESIGN</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} width="56" height="56" alt="PAPI HAIR DESIGN" style={logo} />
        </Section>
        <Heading style={h1}>Overovací kód</Heading>
        <Text style={text}>Použite nasledujúci kód na overenie vašej identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Tento kód čoskoro vyprší. Ak ste ho nežiadali, môžete tento e-mail pokojne ignorovať.
        </Text>
        <Text style={brand}>PAPI HAIR DESIGN · Hair studio &amp; Barber</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '480px', margin: '0 auto' }
const logoSection = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { borderRadius: '50%', display: 'inline-block' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1D1814',
  margin: '0 0 16px',
  textAlign: 'center' as const,
}
const text = {
  fontSize: '14px',
  color: '#6E6461',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#C8962E',
  margin: '0 0 30px',
  textAlign: 'center' as const,
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '28px 0 0' }
const brand = { fontSize: '11px', color: '#C8962E', margin: '12px 0 0', textAlign: 'center' as const }
