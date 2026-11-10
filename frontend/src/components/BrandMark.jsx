import logo from '../assets/ft-logo.svg'

/** Logo de FT. GROUP (vectorial, se ve nítido en cualquier tamaño). */
export default function BrandMark({ className = '' }) {
  return <img src={logo} alt="" aria-hidden="true" className={`brand-mark ${className}`} draggable="false" />
}
