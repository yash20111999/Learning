// async task queue
const delay =(ms)=> new Promise((resolve) => setTimeout(resolve,ms));

const createTaskQueue = (maxConcurrence) =>{
  const queue = [];
  let running = 0;
  const run =  () => {
    while(running<maxConcurrence && queue.length>0){
      const { task, resolve, reject} = queue.shift();
      running++;

      Promise.resolve()
        .then(task)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          running--;
          // schedule next run safely (avoid sync recursion)
          Promise.resolve().then(run);
        });
    }
  }

  return {
    addTask(task) {
      return new Promise((resolve, reject)=>{
        queue.push({task,resolve,reject});
        run();
      })
    }
  }
}

const queue = createTaskQueue(2);

// Success
queue
  .addTask(() => delay(1000).then(() => "A"))
  .then((res) => console.log("Success:", res))
  .catch((err) => console.error("Error:", err));

// Error
queue
  .addTask(() =>
    delay(500).then(() => {
      throw new Error("B failed");
    })
  )
  .then((res) => console.log("Success:", res))
  .catch((err) => console.error("Error:", err.message));

// Success
queue
  .addTask(() => delay(300).then(() => "C"))
  .then((res) => console.log("Success:", res))
  .catch((err) => console.error("Error:", err));

// Success
queue
  .addTask(() => delay(400).then(() => "D"))
  .then((res) => console.log("Success:", res))
  .catch((err) => console.error("Error:", err));