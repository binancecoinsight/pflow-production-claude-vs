using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;

public sealed class PfProcessResult {
  public int ExitCode { get; set; } = -1;
  public string StdOut { get; set; } = "";
  public string StdErr { get; set; } = "";
  public bool TimedOut { get; set; }
  public bool Cancelled { get; set; }
  public bool Overflow { get; set; }
  public bool AllStopped { get; set; }
}

public sealed class PfProcessInvocation {
  public string FileName { get; set; } = "";
  public string[] Arguments { get; set; } = Array.Empty<string>();
  public Dictionary<string,string> Environment { get; set; } = new Dictionary<string,string>();
  public int TimeoutMilliseconds { get; set; }
  public string CancellationPath { get; set; } = "";
  public int MaximumCharacters { get; set; }
}

public interface IPfProcessAdapter {
  PfProcessResult Run(string fileName,string[] arguments,IDictionary<string,string> environment,
    int timeoutMilliseconds,string cancellationPath,int maximumCharacters);
}

public sealed class PfRealProcessAdapter : IPfProcessAdapter {
  public PfProcessResult Run(string fileName,string[] arguments,IDictionary<string,string> environment,
    int timeoutMilliseconds,string cancellationPath,int maximumCharacters) =>
      PfBoundedProcess.Run(fileName,arguments,environment,timeoutMilliseconds,cancellationPath,maximumCharacters);
}

public sealed class PfSpyProcessAdapter : IPfProcessAdapter {
  public readonly List<PfProcessInvocation> Invocations = new List<PfProcessInvocation>();
  public readonly Queue<PfProcessResult> Results = new Queue<PfProcessResult>();
  public PfProcessResult Run(string fileName,string[] arguments,IDictionary<string,string> environment,
    int timeoutMilliseconds,string cancellationPath,int maximumCharacters) {
    Invocations.Add(new PfProcessInvocation { FileName=fileName,Arguments=(string[])arguments.Clone(),
      Environment=new Dictionary<string,string>(environment),TimeoutMilliseconds=timeoutMilliseconds,
      CancellationPath=cancellationPath,MaximumCharacters=maximumCharacters });
    if(Results.Count==0) throw new InvalidOperationException("spy result absent");
    return Results.Dequeue();
  }
}

public static class PfProcessBridge {
  public static IPfProcessAdapter Adapter { get; set; } = new PfRealProcessAdapter();
  public static PfProcessResult Run(string fileName,string[] arguments,IDictionary<string,string> environment,
    int timeoutMilliseconds,string cancellationPath,int maximumCharacters) =>
      Adapter.Run(fileName,arguments,environment,timeoutMilliseconds,cancellationPath,maximumCharacters);
  public static void Reset() { Adapter=new PfRealProcessAdapter(); }
}

public static class PfBoundedProcess {
  public static PfProcessResult Run(string fileName, string[] arguments, IDictionary<string,string> environment,
    int timeoutMilliseconds, string cancellationPath, int maximumCharacters) {
    var result = new PfProcessResult();
    var stdout = new StringBuilder(); var stderr = new StringBuilder(); var gate = new object();
    using var process = new Process();
    process.StartInfo = new ProcessStartInfo(fileName) { UseShellExecute=false, RedirectStandardOutput=true,
      RedirectStandardError=true, CreateNoWindow=true };
    foreach(var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
    foreach(var pair in environment) process.StartInfo.Environment[pair.Key]=pair.Value;
    DataReceivedEventHandler capture = (sender,eventArgs) => {
      if(eventArgs.Data==null) return;
      lock(gate) {
        var destination = ReferenceEquals(sender,process) ? stdout : stderr;
        if(stdout.Length+stderr.Length+eventArgs.Data.Length+1 > maximumCharacters) {
          result.Overflow=true; try { process.Kill(true); } catch { }
          return;
        }
        destination.AppendLine(eventArgs.Data);
      }
    };
    process.OutputDataReceived += capture;
    process.ErrorDataReceived += (sender,eventArgs) => {
      if(eventArgs.Data==null) return;
      lock(gate) {
        if(stdout.Length+stderr.Length+eventArgs.Data.Length+1 > maximumCharacters) {
          result.Overflow=true; try { process.Kill(true); } catch { }
          return;
        }
        stderr.AppendLine(eventArgs.Data);
      }
    };
    var clock=Stopwatch.StartNew();
    try {
      if(!process.Start()) throw new InvalidOperationException("process did not start");
      process.BeginOutputReadLine(); process.BeginErrorReadLine();
      while(!process.WaitForExit(100)) {
        if(System.IO.File.Exists(cancellationPath)) { result.Cancelled=true; process.Kill(true); break; }
        if(clock.ElapsedMilliseconds>=timeoutMilliseconds) { result.TimedOut=true; process.Kill(true); break; }
      }
      if(!process.HasExited) process.Kill(true);
      process.WaitForExit(5000);
      result.AllStopped=process.HasExited;
      if(process.HasExited) result.ExitCode=process.ExitCode;
    } finally {
      if(!process.HasExited) { try { process.Kill(true); process.WaitForExit(5000); } catch { } }
      result.AllStopped=process.HasExited;
      lock(gate) { result.StdOut=stdout.ToString(); result.StdErr=stderr.ToString(); }
    }
    return result;
  }
}

public sealed class PfRunningProcess : IDisposable {
  readonly Process process; readonly StringBuilder stdout=new StringBuilder(),stderr=new StringBuilder(); readonly object gate=new object(); readonly int maximum;
  public bool Overflow { get; private set; }
  PfRunningProcess(Process process,int maximum) { this.process=process;this.maximum=maximum; }
  public static PfRunningProcess Start(string fileName,string[] arguments,IDictionary<string,string> environment,int maximumCharacters) {
    var process=new Process();process.StartInfo=new ProcessStartInfo(fileName){UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true};
    foreach(var argument in arguments)process.StartInfo.ArgumentList.Add(argument);foreach(var pair in environment)process.StartInfo.Environment[pair.Key]=pair.Value;
    var running=new PfRunningProcess(process,maximumCharacters);process.OutputDataReceived+=(s,e)=>running.Capture(running.stdout,e.Data);process.ErrorDataReceived+=(s,e)=>running.Capture(running.stderr,e.Data);
    if(!process.Start())throw new InvalidOperationException("process did not start");process.BeginOutputReadLine();process.BeginErrorReadLine();return running;
  }
  void Capture(StringBuilder target,string data){if(data==null)return;lock(gate){if(stdout.Length+stderr.Length+data.Length+1>maximum){Overflow=true;try{process.Kill(true);}catch{}return;}target.AppendLine(data);}}
  public int Id => process.Id; public bool HasExited => process.HasExited; public int ExitCode => process.HasExited?process.ExitCode:-1;
  public string StdOut {get{lock(gate)return stdout.ToString();}} public string StdErr {get{lock(gate)return stderr.ToString();}}
  public bool Wait(int milliseconds)=>process.WaitForExit(milliseconds);
  public void Stop(){try{if(!process.HasExited)process.Kill(true);}catch{}try{process.WaitForExit(5000);}catch{}}
  public void Dispose(){Stop();process.Dispose();}
}
