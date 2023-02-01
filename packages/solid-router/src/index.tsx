export function Link(props: any) {
  return (
    <a href={props.to} {...props}>
      {props.children}
    </a>
  )
}

export default Link 
