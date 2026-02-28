/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

const LOGO_URL = 'https://eudwjgdijylsgcnncxeg.supabase.co/storage/v1/object/public/email-assets/logo-icon.webp'

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="sk" dir="ltr">
    <Head />
    <Preview>Pozvánka do PAPI HAIR DESIGN</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} width="56" height="56" alt="PAPI HAIR DESIGN" style={logo} />
        </Section>
        <Heading style={h1}>Boli ste pozvaní</Heading>
        <Text style={text}>
          Boli ste pozvaní do PAPI HAIR DESIGN. Kliknite na tlačidlo nižšie
          pre prijatie pozvánky a vytvorenie účtu.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Prijať pozvánku
        </Button>
        <Text style={footer}>
          Ak ste túto pozvánku neočakávali, môžete tento e-mail pokojne ignorovať.
        </Text>
        <Text style={brand}>PAPI HAIR DESIGN · Hair studio &amp; Barber</Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#000000', fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '480px', margin: '0 auto', backgroundColor: '#000000' }
const logoSection = { textAlign: 'center' as const, marginBottom: '24px' }
const logo = { borderRadius: '50%', display: 'inline-block' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#C8962E',
  margin: '0 0 16px',
  textAlign: 'center' as const,
}
const text = {
  fontSize: '14px',
  color: '#A8A8A8',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const button = {
  backgroundColor: '#C8962E',
  color: '#000000',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '10px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'block',
  textAlign: 'center' as const,
}
const footer = { fontSize: '12px', color: '#666666', margin: '28px 0 0' }
const brand = { fontSize: '11px', color: '#C8962E', margin: '12px 0 0', textAlign: 'center' as const }
