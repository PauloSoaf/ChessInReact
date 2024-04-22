import ChessBoard from "./components/ChessBoard/ChessBoard"

const App = () => {

  return (
    <div style={{
      minHeight: '100vh',
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'center',
      backgroundColor: 'black',
      color: 'white',
      flexDirection: 'column',
      }}>
      <>Psoaf Chess</>
      <ChessBoard />
    </div>
  )
}

export default App
