import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const HasShown = ({ id }: { id: string }) => {
  const [hasShown, setHasShown] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!hasShown && entry.isIntersecting) {
        setHasShown(true)
      }
    })

    const currentRef = elementRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasShown])

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true)
    }, 100)

    return () => {
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="relative">
      <div className="absolute h-2" ref={elementRef}></div>
      <div className="h-6" id={id}>
        {visible && (hasShown ? 'shown' : 'not shown')}
      </div>
    </div>
  )
}

export default HasShown
